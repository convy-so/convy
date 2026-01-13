import "server-only";

import { getRedisClient } from "@/lib/redis";
import { enqueueSurveyAnalytics } from "@/lib/queue";
import { surveyAnalyticsQueue } from "@/lib/queue";
import { db } from "@/db";
import { surveyAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Analytics Scheduling System
 * 
 * Implements a two-stage approach:
 * 1. Accumulation mode: Track counter, generate only when threshold reached
 * 2. Debouncing mode: Once threshold reached, debounce for 5 minutes
 * 
 * Exceptions:
 * - First 3 responses generate immediately
 */

const DEBOUNCE_DELAY_MS = 5 * 60 * 1000;
const RESPONSE_THRESHOLD = 10;
const IMMEDIATE_THRESHOLD = 3;

/**
 * Get the current analytics counter for a survey
 */
async function getAnalyticsCounter(surveyId: string): Promise<number> {
  const redis = getRedisClient();
  const key = `analytics:counter:${surveyId}`;
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Increment the analytics counter for a survey
 */
async function incrementAnalyticsCounter(surveyId: string): Promise<number> {
  const redis = getRedisClient();
  const key = `analytics:counter:${surveyId}`;
  const newCount = await redis.incr(key);
  // Set expiration to 7 days (prevent Redis from accumulating stale counters)
  await redis.expire(key, 7 * 24 * 60 * 60);
  return newCount;
}

/**
 * Reset the analytics counter for a survey
 */
async function resetAnalyticsCounter(surveyId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `analytics:counter:${surveyId}`;
  await redis.del(key);
}

/**
 * Check if analytics have been generated for a survey before
 * Checks the database to see if analytics exist
 */
async function hasAnalyticsBeenGenerated(surveyId: string): Promise<boolean> {
  try {
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId))
      .limit(1);
    return !!analytics;
  } catch (error) {
    console.error(
      `[Analytics Scheduler] Error checking if analytics exist for survey ${surveyId}:`,
      error
    );
    // If we can't check, assume they don't exist (safer default)
    return false;
  }
}

/**
 * Get the scheduled analytics job ID for a survey
 */
function getScheduledJobId(surveyId: string): string {
  return `analytics-debounced-${surveyId}`;
}

/**
 * Cancel any existing scheduled analytics job for a survey
 */
async function cancelScheduledAnalytics(surveyId: string): Promise<void> {
  try {
    const jobId = getScheduledJobId(surveyId);
    const job = await surveyAnalyticsQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(
        `[Analytics Scheduler] Cancelled scheduled analytics job for survey ${surveyId}`
      );
    }
  } catch (error) {
    // Job might not exist, which is fine
    console.log(
      `[Analytics Scheduler] No scheduled job to cancel for survey ${surveyId}`
    );
  }
}

/**
 * Schedule a debounced analytics generation job
 */
async function scheduleDebouncedAnalytics(
  surveyId: string,
  userId: string
): Promise<void> {
  try {
    // Cancel any existing scheduled job
    await cancelScheduledAnalytics(surveyId);

    // Schedule new job with delay
    const jobId = getScheduledJobId(surveyId);
    await surveyAnalyticsQueue.add(
      "generate-analytics",
      {
        surveyId,
        userId,
      },
      {
        jobId,
        delay: DEBOUNCE_DELAY_MS,
        priority: 3,
      }
    );

    console.log(
      `[Analytics Scheduler] Scheduled debounced analytics generation for survey ${surveyId} (5 minute delay)`
    );
  } catch (error) {
    console.error(
      `[Analytics Scheduler] Failed to schedule debounced analytics:`,
      error
    );
    throw error;
  }
}

/**
 * Generate analytics immediately
 */
async function generateAnalyticsImmediately(
  surveyId: string,
  userId: string
): Promise<void> {
  try {
    await enqueueSurveyAnalytics({
      surveyId,
      userId,
    });
    console.log(
      `[Analytics Scheduler] Generated analytics immediately for survey ${surveyId}`
    );
  } catch (error) {
    console.error(
      `[Analytics Scheduler] Failed to generate analytics immediately:`,
      error
    );
    throw error;
  }
}

/**
 * Main function to handle analytics scheduling when a new conversation completes
 * 
 * Logic:
 * 1. If this is one of the first 3 responses → Generate immediately
 * 2. Otherwise, increment counter
 * 3. If counter < 10 → Just accumulate (do nothing)
 * 4. If counter >= 10 → Enter debouncing mode:
 *    - Cancel any existing scheduled job
 *    - Schedule new job with 5-minute delay
 *    - Each new response resets the timer
 */
export async function scheduleAnalyticsOnNewResponse(
  surveyId: string,
  userId: string
): Promise<void> {
  try {
    // Check if analytics have been generated before
    const hasGenerated = await hasAnalyticsBeenGenerated(surveyId);
    
    // Get current counter
    const currentCount = await getAnalyticsCounter(surveyId);

    // Exception: First 3 responses generate immediately
    if (!hasGenerated && currentCount < IMMEDIATE_THRESHOLD) {
      const newCount = await incrementAnalyticsCounter(surveyId);
      console.log(
        `[Analytics Scheduler] Response ${newCount}/${IMMEDIATE_THRESHOLD} for survey ${surveyId} - generating immediately`
      );
      
      // Generate immediately
      await generateAnalyticsImmediately(surveyId, userId);
      
      // Reset counter after immediate generation
      await resetAnalyticsCounter(surveyId);
      return;
    }

    // Increment counter
    const newCount = await incrementAnalyticsCounter(surveyId);
    console.log(
      `[Analytics Scheduler] Survey ${surveyId} response count: ${newCount}/${RESPONSE_THRESHOLD}`
    );

    // If counter is below threshold, just accumulate (do nothing)
    if (newCount < RESPONSE_THRESHOLD) {
      console.log(
        `[Analytics Scheduler] Survey ${surveyId} accumulating responses (${newCount}/${RESPONSE_THRESHOLD})`
      );
      return;
    }

    // Counter has reached threshold - enter debouncing mode
    console.log(
      `[Analytics Scheduler] Survey ${surveyId} reached threshold (${newCount} responses) - entering debouncing mode`
    );

    // Cancel any existing scheduled job and schedule new one (resets timer)
    await scheduleDebouncedAnalytics(surveyId, userId);
  } catch (error) {
    console.error(
      `[Analytics Scheduler] Error scheduling analytics for survey ${surveyId}:`,
      error
    );
    // Don't throw - we don't want to fail the conversation insights job
  }
}

/**
 * Reset the analytics counter after analytics are generated
 * This is called by the analytics worker after successful generation
 */
export async function resetAnalyticsCounterAfterGeneration(
  surveyId: string
): Promise<void> {
  await resetAnalyticsCounter(surveyId);
  console.log(
    `[Analytics Scheduler] Reset counter for survey ${surveyId} after analytics generation`
  );
}

