import { Worker } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { SubscriptionMonitorJobData, enqueueEmail } from "@/lib/queue";
import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { logger } from "@/lib/logger";

const connection = getRedisClient();

const worker = new Worker<SubscriptionMonitorJobData>(
  "subscription-monitor",
  async (job) => {
    logger.info("Starting subscription monitor check", { jobId: job.id });

    try {
      const now = new Date();
      
      // Select all active subscriptions to filter in memory for complex metadata checks
      // In a very high-scale system, we'd want a DB index on nextNotificationDate, 
      // but for <100k subs, a single scan of active subs in a daily background job is acceptable.
      const activeSubs = await db
        .select({
          subscription: subscriptions,
          user: users,
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .where(eq(subscriptions.status, "active"));

      let processedCount = 0;

      for (const { subscription, user } of activeSubs) {
        const metadata = (subscription.metadata as Record<string, any>) || {};
        
        // Filter for Coinbase Commerce (or non-Lemon Squeezy)
        // If lemonSqueezySubscriptionId is present, LS handles dunning/emails (usually).
        if (subscription.lemonSqueezySubscriptionId && metadata.provider !== 'coinbase_business') {
            continue;
        }
        
        const expiry = new Date(subscription.currentPeriodEnd);
        const timeDiff = expiry.getTime() - now.getTime();
        const daysUntilExpiry = timeDiff / (1000 * 3600 * 24);

        // Filter 1: Check if "expired" or "not expiring soon"
        // We only care about things expiring in the next 7 days.
        if (daysUntilExpiry < 0 || daysUntilExpiry > 7) {
             continue;
        }

        // Filter 2: Idempotency Check
        // Have we already notified *for this billing period*?
        // We check if `lastExpiryNotificationAt` exists AND is after `currentPeriodStart`
        const periodStart = new Date(subscription.currentPeriodStart);
        const lastNotifiedStr = metadata.lastExpiryNotificationAt as string | undefined;

        if (lastNotifiedStr) {
            const lastNotified = new Date(lastNotifiedStr);
            if (lastNotified > periodStart) {
                // Already notified for this cycle
                continue;
            }
        }

        logger.info("Found expiring Coinbase subscription to notify", { 
             subscriptionId: subscription.id, 
             userId: user.id, 
             daysUntilExpiry: daysUntilExpiry.toFixed(2)
        });

        // Update metadata FIRST to mark notification sent (idempotency)
        // This prevents duplicate emails if the job is retried after email enqueue succeeds
        // but before processedCount++ or if the job runs again while email is pending
        await db.update(subscriptions)
            .set({
                metadata: {
                    ...metadata,
                    lastExpiryNotificationAt: now.toISOString()
                }
            })
            .where(eq(subscriptions.id, subscription.id));

        // Queue Email after marking as notified
        // If this fails, the job will throw and BullMQ will retry
        // On retry, the idempotency check above will prevent re-processing
        await enqueueEmail({
             type: "subscription-expiration",
             email: user.email,
             url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`, 
             name: user.name,
             metadata: {
                 reason: "subscription_expiring",
                 expiryDate: expiry.toISOString(),
                 planId: subscription.planId
             }
        });
             
        processedCount++;
      }

      logger.info("Subscription monitor check completed", { processedCount });
    } catch (error) {
      logger.error("Subscription monitor failed", { error });
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on("failed", (job, err) => {
  logger.error(`Subscription monitor job ${job?.id} failed`, { error: err });
});

export default worker;
