
import { db } from "@/db";
import { usageTracking, subscriptionPlans } from "@/db/schema/billing";
import { eq, and, sql } from "drizzle-orm";
import { CacheService, CacheKeys, TTL } from "@/lib/cache";
import { getActiveSubscriptionForUser } from "./plans";

type UsageMetric = 
  | "textSurveysCount"
  | "voiceSurveysCount"
  | "textResponsesCount"
  | "voiceResponsesCount"
  | "voiceMinutesUsed";

export class UsageService {
  /**
   * Increment usage for a user
   * Handles caching and DB updates
   */
  static async incrementUsage(
    userId: string,
    organizationId: string | null,
    metric: UsageMetric,
    amount = 1
  ): Promise<void> {
    const today = new Date();
    // In a real app, we align this with subscription period
    // For now, we fetch the active sub or assume monthly calc
    // Ideally we pass periodStart/End or fetch from context
    
    // We update DB atomically
    // For organization-level tracking, we filter by orgId
    // If personal, orgId is null
    
    // 1. Get current active period for user to find the right usage row
    // If no active sub, maybe free tier logic applies (not covered here deeply)
    const sub = await getActiveSubscriptionForUser(userId);
    
    if (!sub) {
        // Fallback or error - assume free tier logic or create usage record for current month
        // For simplicity/robustness, we just try to update the current period's record
        // In reality, we should ensure a usage record exists.
        // Let's assume usage record creation happens on sub creation/renewal
        // But for safety, we might need upsert logic here.
        return; 
    }

    const { currentPeriodStart, currentPeriodEnd } = sub;

    // 2. Increment in DB
    // Use upsert to ensure record exists
    await db
      .insert(usageTracking)
      .values({
        id: `usage_${userId}_${Date.now()}`, // Only used if inserting new
        userId,
        organizationId: sub.organizationId || null, 
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        [metric]: metric === "voiceMinutesUsed" ? sql`${amount}::numeric` : amount,
      })
      .onConflictDoUpdate({
        target: [usageTracking.userId, usageTracking.organizationId, usageTracking.periodStart],
        set: {
           [metric]: metric === "voiceMinutesUsed" 
             ? sql`${usageTracking.voiceMinutesUsed} + ${amount}` 
             : sql`${usageTracking[metric]} + ${amount}`,
           updatedAt: new Date(),
        }
      });
      
    // 3. Invalidate/Update Cache
    // We clear the usage cache so next check fetches fresh data
    const cacheKey = CacheKeys.usage(userId, "current"); // Simplified key
    await CacheService.del(cacheKey);
  }

  /**
   * Check if user has exceeded usage limits
   */
  static async checkUsageLimit(
    userId: string,
    metric: UsageMetric,
    limit: number | null // null means unlimited
  ): Promise<boolean> {
    if (limit === null) return true;

    // 1. Check Cache
    const cacheKey = CacheKeys.usage(userId, "current");
    let usageData = await CacheService.get<Record<string, number>>(cacheKey);

    if (!usageData) {
      // 2. Fetch from DB
      // We need to know current period again.
      // Optimization: Cache subscription period too or pass it in.
      const sub = await getActiveSubscriptionForUser(userId);
      if (!sub) return false; // No sub = no usage allowed usually, or strict limits

      const record = await db.query.usageTracking.findFirst({
        where: and(
          eq(usageTracking.userId, userId),
          eq(usageTracking.periodStart, sub.currentPeriodStart)
        )
      });

      usageData = {
          textSurveysCount: record?.textSurveysCount || 0,
          voiceSurveysCount: record?.voiceSurveysCount || 0,
          textResponsesCount: record?.textResponsesCount || 0,
          voiceResponsesCount: record?.voiceResponsesCount || 0,
          voiceMinutesUsed: parseFloat(record?.voiceMinutesUsed || "0"),
      };

      await CacheService.set(cacheKey, usageData, TTL.usage);
    }

    const currentUsage = usageData[metric] || 0;
    return currentUsage < limit;
  }
}
