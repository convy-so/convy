import { Worker } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { NotionBulkOperationJobData } from "@/lib/queue";
import { db } from "@/db";
import {
  notionBulkOperations,
  surveyAnalytics,
  surveyConversations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueNotionSync } from "@/lib/queue";

const connection = getRedisClient();

const BATCH_SIZE = 5;
const BATCH_DELAY = 2000;

/**
 * Sleep helper
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Update operation progress
 */
async function updateProgress(
  operationId: string,
  updates: {
    processedItems?: number;
    successCount?: number;
    failCount?: number;
    warningCount?: number;
    status?: string;
    errors?: Array<{ surveyId: string; error: string; timestamp: string }>;
  }
) {
  const current = await db
    .select()
    .from(notionBulkOperations)
    .where(eq(notionBulkOperations.id, operationId))
    .limit(1);

  if (current.length === 0) return;

  const existing = current[0];

  await db
    .update(notionBulkOperations)
    .set({
      processedItems: updates.processedItems ?? existing.processedItems,
      successCount: updates.successCount ?? existing.successCount,
      failCount: updates.failCount ?? existing.failCount,
      warningCount: updates.warningCount ?? existing.warningCount,
      status: updates.status ?? existing.status,
      errors: updates.errors ?? existing.errors,
      updatedAt: new Date(),
    })
    .where(eq(notionBulkOperations.id, operationId));
}

/**
 * Sync a single survey with all its data
 */
async function syncSurvey(
  surveyId: string,
  userId: string,
  operationType: string
): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  try {
    const warnings: string[] = [];
    try {
      await enqueueNotionSync({
        userId,
        surveyId,
        syncType: "survey",
        forceUpdate: operationType === "resync",
      });
    } catch (error) {
      warnings.push(
        `Survey metadata sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId))
      .limit(1);

    if (analytics) {
      try {
        await enqueueNotionSync({
          userId,
          surveyId,
          syncType: "analytics",
          forceUpdate: operationType === "resync",
        });
      } catch (error) {
        warnings.push(
          `Analytics sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    const conversations = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    for (const conversation of conversations) {
      try {
        await enqueueNotionSync({
          userId,
          surveyId,
          syncType: "conversation",
          targetId: conversation.id,
          forceUpdate: operationType === "resync",
        });
      } catch (error) {
        warnings.push(
          `Conversation ${conversation.id} sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Main worker processor
 */
const worker = new Worker<NotionBulkOperationJobData>(
  "notion-bulk-operation",
  async (job) => {
    const { operationId, userId, operationType, surveyIds, batchSize } =
      job.data;

    console.log("Processing bulk operation:", {
      operationId,
      operationType,
      totalSurveys: surveyIds.length,
    });

    await updateProgress(operationId, {
      status: "running",
    });

    await db
      .update(notionBulkOperations)
      .set({ startedAt: new Date() })
      .where(eq(notionBulkOperations.id, operationId));

    const effectiveBatchSize = batchSize || BATCH_SIZE;
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    let warningCount = 0;
    const allErrors: Array<{
      surveyId: string;
      error: string;
      timestamp: string;
    }> = [];

    for (let i = 0; i < surveyIds.length; i += effectiveBatchSize) {
      const batch = surveyIds.slice(i, i + effectiveBatchSize);

      console.log(
        `Processing batch ${Math.floor(i / effectiveBatchSize) + 1}/${Math.ceil(surveyIds.length / effectiveBatchSize)}`
      );

      const results = await Promise.allSettled(
        batch.map((surveyId) => syncSurvey(surveyId, userId, operationType))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const surveyId = batch[j];

        processedCount++;

        if (result.status === "fulfilled") {
          if (result.value.success) {
            successCount++;
            if (result.value.warnings && result.value.warnings.length > 0) {
              warningCount++;
            }
          } else {
            failCount++;
            allErrors.push({
              surveyId,
              error: result.value.error || "Unknown error",
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          failCount++;
          allErrors.push({
            surveyId,
            error: result.reason?.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });
        }
      }

      await updateProgress(operationId, {
        processedItems: processedCount,
        successCount,
        failCount,
        warningCount,
        errors: allErrors,
      });

      const progressPercent = Math.floor(
        (processedCount / surveyIds.length) * 100
      );
      await job.updateProgress(progressPercent);

      if (i + effectiveBatchSize < surveyIds.length) {
        await sleep(BATCH_DELAY);
      }
    }

    await updateProgress(operationId, {
      status: "completed",
    });

    await db
      .update(notionBulkOperations)
      .set({ completedAt: new Date() })
      .where(eq(notionBulkOperations.id, operationId));

    console.log("Bulk operation completed:", {
      operationId,
      processedCount,
      successCount,
      failCount,
      warningCount,
    });

    return {
      operationId,
      processedCount,
      successCount,
      failCount,
      warningCount,
      errors: allErrors,
    };
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Bulk operation job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  console.error(`❌ Bulk operation job ${job?.id} failed:`, err);

  if (job?.data?.operationId) {
    await updateProgress(job.data.operationId, {
      status: "failed",
    });

    await db
      .update(notionBulkOperations)
      .set({ completedAt: new Date() })
      .where(eq(notionBulkOperations.id, job.data.operationId));
  }
});

worker.on("error", (err) => {
  console.error("❌ Bulk operation worker error:", err);
});

worker.on("progress", (job, progress) => {
  console.log(`📊 Bulk operation ${job.id}: ${progress}% complete`);
});

console.log("🔄 Notion Bulk Operation Worker started");

export default worker;
