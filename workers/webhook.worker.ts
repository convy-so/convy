import { Job, Worker } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { webhookQueue } from "@/lib/queue";
import { logger } from "@/lib/logger";
import type { WebhookPayload } from "@/lib/zapier/types";



const connection = getRedisClient();

export const webhookWorker = new Worker(
  "webhooks",
  async (job: Job<{ subscriptionId: string; payload: WebhookPayload; deliveryId?: string }>) => {

    const { subscriptionId, payload, deliveryId } = job.data;
    
    logger.info("Processing webhook delivery", { id: job.id, subscriptionId, deliveryId });

    try {
        const { processWebhookDelivery } = await import("@/lib/zapier/webhook-delivery");
        
        // Pass a generated deliveryId if one wasn't provided (though one should be)
        const activeDeliveryId = deliveryId || crypto.randomUUID();
        
        const result = await processWebhookDelivery(subscriptionId, payload, activeDeliveryId);
        
        if (!result.success) {
            throw new Error(result.error || "Unknown delivery error");
        }
        
        logger.info("Webhook delivered successfully", { id: job.id, statusCode: result.statusCode });
        return { status: result.statusCode || 200, statusText: "OK" };
    } catch (error) {
        logger.error("Webhook delivery failed", { id: job.id, error });
        throw error; // Triggers BullMQ retry
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,  // Rate limit: 10 per second per worker
      duration: 1000,
    }
  }
);

webhookWorker.on("completed", (job) => {
  logger.debug("Webhook delivery job completed", { id: job.id });
});

webhookWorker.on("failed", (job, err) => {
  logger.warn("Webhook delivery job failed", { id: job?.id, error: err.message });
});
