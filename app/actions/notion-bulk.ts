"use server";

/**
 * Notion Bulk Operations Actions
 *
 * Server actions for bulk syncing multiple surveys,
 * progress tracking, and operation management
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { surveys, notionBulkOperations } from "@/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { hasOAuthIntegration } from "@/lib/notion-oauth";
import { enqueueBulkOperation } from "@/lib/queue";

/**
 * Start a bulk sync operation for selected surveys
 */
export async function startBulkSync(
  surveyIds: string[],
  operationType: "sync_all" | "sync_selected" | "resync" = "sync_selected"
) {
  try {
    const session = await getVerifiedSession();

    if (!surveyIds || surveyIds.length === 0) {
      return {
        success: false,
        error: "No surveys selected",
      };
    }

    // Check if integration exists
    const hasIntegration = await hasOAuthIntegration(session.user.id);
    if (!hasIntegration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // Verify all surveys belong to user
    const userSurveys = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(
        and(eq(surveys.userId, session.user.id), inArray(surveys.id, surveyIds))
      );

    if (userSurveys.length !== surveyIds.length) {
      return {
        success: false,
        error: "Some surveys not found or unauthorized",
      };
    }

    // Create bulk operation record
    const operationId = crypto.randomUUID();

    await db.insert(notionBulkOperations).values({
      id: operationId,
      userId: session.user.id,
      operationType,
      targetSurveyIds: surveyIds,
      totalItems: surveyIds.length,
      processedItems: 0,
      successCount: 0,
      failCount: 0,
      warningCount: 0,
      status: "pending",
    });

    // Queue the bulk operation job
    const job = await enqueueBulkOperation({
      operationId,
      userId: session.user.id,
      operationType,
      surveyIds,
    });

    return {
      success: true,
      message: `Bulk sync started for ${surveyIds.length} surveys`,
      operationId,
      jobId: job.id,
    };
  } catch (error) {
    console.error("Error starting bulk sync:", error);
    return {
      success: false,
      error: "Failed to start bulk sync",
    };
  }
}

/**
 * Start bulk sync for ALL user surveys
 */
export async function startBulkSyncAll() {
  try {
    const session = await getVerifiedSession();

    // Check if integration exists
    const hasIntegration = await hasOAuthIntegration(session.user.id);
    if (!hasIntegration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // Get all user surveys
    const userSurveys = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id));

    if (userSurveys.length === 0) {
      return {
        success: false,
        error: "No surveys found",
      };
    }

    const surveyIds = userSurveys.map((s) => s.id);

    // Create bulk operation record
    const operationId = crypto.randomUUID();

    await db.insert(notionBulkOperations).values({
      id: operationId,
      userId: session.user.id,
      operationType: "sync_all",
      targetSurveyIds: surveyIds,
      totalItems: surveyIds.length,
      processedItems: 0,
      successCount: 0,
      failCount: 0,
      warningCount: 0,
      status: "pending",
    });

    // Queue the bulk operation job
    const job = await enqueueBulkOperation({
      operationId,
      userId: session.user.id,
      operationType: "sync_all",
      surveyIds,
    });

    return {
      success: true,
      message: `Bulk sync started for all ${surveyIds.length} surveys`,
      operationId,
      jobId: job.id,
    };
  } catch (error) {
    console.error("Error starting bulk sync all:", error);
    return {
      success: false,
      error: "Failed to start bulk sync",
    };
  }
}

/**
 * Get bulk operation status by ID
 */
export async function getBulkOperationStatus(operationId: string) {
  try {
    const session = await getVerifiedSession();

    const [operation] = await db
      .select()
      .from(notionBulkOperations)
      .where(
        and(
          eq(notionBulkOperations.id, operationId),
          eq(notionBulkOperations.userId, session.user.id)
        )
      );

    if (!operation) {
      return {
        success: false,
        error: "Operation not found",
        operation: null,
      };
    }

    // Calculate progress
    const progress =
      operation.totalItems > 0
        ? Math.floor((operation.processedItems / operation.totalItems) * 100)
        : 0;

    // Estimate completion time
    let estimatedMinutesRemaining = null;
    if (
      operation.status === "running" &&
      operation.startedAt &&
      operation.processedItems > 0
    ) {
      const elapsed = Date.now() - new Date(operation.startedAt).getTime();
      const timePerItem = elapsed / operation.processedItems;
      const remaining = operation.totalItems - operation.processedItems;
      estimatedMinutesRemaining = Math.ceil((timePerItem * remaining) / 60000);
    }

    return {
      success: true,
      operation: {
        id: operation.id,
        operationType: operation.operationType,
        totalItems: operation.totalItems,
        processedItems: operation.processedItems,
        successCount: operation.successCount,
        failCount: operation.failCount,
        warningCount: operation.warningCount,
        status: operation.status,
        progress,
        errors: operation.errors || [],
        createdAt: operation.createdAt,
        startedAt: operation.startedAt,
        completedAt: operation.completedAt,
        estimatedMinutesRemaining,
      },
    };
  } catch (error) {
    console.error("Error getting bulk operation status:", error);
    return {
      success: false,
      error: "Failed to get operation status",
      operation: null,
    };
  }
}

/**
 * Get all bulk operations for user
 */
export async function getBulkOperations(limit = 20) {
  try {
    const session = await getVerifiedSession();

    const operations = await db
      .select({
        id: notionBulkOperations.id,
        operationType: notionBulkOperations.operationType,
        totalItems: notionBulkOperations.totalItems,
        processedItems: notionBulkOperations.processedItems,
        successCount: notionBulkOperations.successCount,
        failCount: notionBulkOperations.failCount,
        warningCount: notionBulkOperations.warningCount,
        status: notionBulkOperations.status,
        createdAt: notionBulkOperations.createdAt,
        startedAt: notionBulkOperations.startedAt,
        completedAt: notionBulkOperations.completedAt,
      })
      .from(notionBulkOperations)
      .where(eq(notionBulkOperations.userId, session.user.id))
      .orderBy(desc(notionBulkOperations.createdAt))
      .limit(limit);

    return {
      success: true,
      operations: operations.map((op) => ({
        ...op,
        progress:
          op.totalItems > 0
            ? Math.floor((op.processedItems / op.totalItems) * 100)
            : 0,
      })),
    };
  } catch (error) {
    console.error("Error getting bulk operations:", error);
    return {
      success: false,
      error: "Failed to get bulk operations",
      operations: [],
    };
  }
}

/**
 * Cancel a running bulk operation
 */
export async function cancelBulkOperation(operationId: string) {
  try {
    const session = await getVerifiedSession();

    const [operation] = await db
      .select()
      .from(notionBulkOperations)
      .where(
        and(
          eq(notionBulkOperations.id, operationId),
          eq(notionBulkOperations.userId, session.user.id)
        )
      );

    if (!operation) {
      return {
        success: false,
        error: "Operation not found",
      };
    }

    if (operation.status !== "running" && operation.status !== "pending") {
      return {
        success: false,
        error: "Operation is not running",
      };
    }

    // Update status to cancelled
    await db
      .update(notionBulkOperations)
      .set({
        status: "cancelled",
        completedAt: new Date(),
      })
      .where(eq(notionBulkOperations.id, operationId));

    // TODO: Cancel the actual job in the queue

    return {
      success: true,
      message: "Bulk operation cancelled",
    };
  } catch (error) {
    console.error("Error cancelling bulk operation:", error);
    return {
      success: false,
      error: "Failed to cancel operation",
    };
  }
}

/**
 * Delete old bulk operation records
 */
export async function cleanupOldBulkOperations(daysOld = 30) {
  try {
    const session = await getVerifiedSession();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(notionBulkOperations)
      .where(
        and(
          eq(notionBulkOperations.userId, session.user.id),
          eq(notionBulkOperations.status, "completed")
        )
      );

    return {
      success: true,
      message: "Old bulk operations cleaned up",
    };
  } catch (error) {
    console.error("Error cleaning up bulk operations:", error);
    return {
      success: false,
      error: "Failed to cleanup operations",
    };
  }
}
