"use server";

/**
 * Notion Conflict Resolution Actions
 *
 * Server actions for managing sync conflicts between
 * app and Notion data
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { notionSyncConflicts } from "@/db/schema";
import { eq, and, desc, ne, lte } from "drizzle-orm";
import {
  resolveConflict,
  applyConflictResolution,
  type ResolutionStrategy,
} from "@/lib/notion-conflict";
import { getNotionOAuthClient } from "@/lib/notion-oauth";

/**
 * Get all pending conflicts for user
 */
export async function getPendingConflicts(limit = 50) {
  try {
    const session = await getVerifiedSession();

    const conflicts = await db
      .select()
      .from(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.userId, session.user.id),
          eq(notionSyncConflicts.resolution, "pending")
        )
      )
      .orderBy(desc(notionSyncConflicts.createdAt))
      .limit(limit);

    return {
      success: true,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        resourceType: c.resourceType,
        resourceId: c.resourceId,
        notionPageId: c.notionPageId,
        conflictType: c.conflictType,
        conflictDetails: c.conflictDetails,
        createdAt: c.createdAt,
      })),
    };
  } catch (error) {
    console.error("Error getting pending conflicts:", error);
    return {
      success: false,
      error: "Failed to get conflicts",
      conflicts: [],
    };
  }
}

/**
 * Get all conflicts for a specific survey
 */
export async function getSurveyConflicts(surveyId: string) {
  try {
    const session = await getVerifiedSession();

    const conflicts = await db
      .select()
      .from(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.userId, session.user.id),
          eq(notionSyncConflicts.resourceId, surveyId)
        )
      )
      .orderBy(desc(notionSyncConflicts.createdAt));

    return {
      success: true,
      conflicts,
    };
  } catch (error) {
    console.error("Error getting survey conflicts:", error);
    return {
      success: false,
      error: "Failed to get conflicts",
      conflicts: [],
    };
  }
}

/**
 * Get conflict details
 */
export async function getConflictDetails(conflictId: string) {
  try {
    const session = await getVerifiedSession();

    const [conflict] = await db
      .select()
      .from(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.id, conflictId),
          eq(notionSyncConflicts.userId, session.user.id)
        )
      );

    if (!conflict) {
      return {
        success: false,
        error: "Conflict not found",
        conflict: null,
      };
    }

    return {
      success: true,
      conflict: {
        id: conflict.id,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        notionPageId: conflict.notionPageId,
        conflictType: conflict.conflictType,
        appVersion: conflict.appVersion,
        notionVersion: conflict.notionVersion,
        conflictDetails: conflict.conflictDetails,
        resolution: conflict.resolution,
        resolutionStrategy: conflict.resolutionStrategy,
        resolvedAt: conflict.resolvedAt,
        createdAt: conflict.createdAt,
      },
    };
  } catch (error) {
    console.error("Error getting conflict details:", error);
    return {
      success: false,
      error: "Failed to get conflict details",
      conflict: null,
    };
  }
}

/**
 * Resolve a conflict with specified strategy
 */
export async function resolveConflictAction(
  conflictId: string,
  strategy: ResolutionStrategy
) {
  try {
    const session = await getVerifiedSession();

    const result = await resolveConflict(conflictId, strategy, session.user.id);

    if (!result.success) {
      return result;
    }

    // Apply the resolution
    const notion = await getNotionOAuthClient(session.user.id);
    if (!notion) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    const applyResult = await applyConflictResolution(notion, conflictId);

    return {
      success: applyResult.success,
      message: applyResult.success
        ? "Conflict resolved successfully"
        : applyResult.error,
      resolution: result.resolution,
    };
  } catch (error) {
    console.error("Error resolving conflict:", error);
    return {
      success: false,
      error: "Failed to resolve conflict",
    };
  }
}

/**
 * Auto-resolve all pending conflicts
 */
export async function autoResolveAllConflicts() {
  try {
    const session = await getVerifiedSession();
    
    // Get Notion client first - needed to apply resolutions
    const notion = await getNotionOAuthClient(session.user.id);
    if (!notion) {
      return {
        success: false,
        error: "Notion integration not configured",
        resolvedCount: 0,
        failedCount: 0,
      };
    }

    const conflicts = await db
      .select()
      .from(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.userId, session.user.id),
          eq(notionSyncConflicts.resolution, "pending")
        )
      );

    if (conflicts.length === 0) {
      return {
        success: true,
        message: "No conflicts to resolve",
        resolvedCount: 0,
      };
    }

    let resolvedCount = 0;
    let failedCount = 0;

    for (const conflict of conflicts) {
      // 1. Mark as resolved with "app_priority" (App Wins)
      const resolutionResult = await resolveConflict(
        conflict.id,
        "app_priority", 
        session.user.id
      );

      if (!resolutionResult.success) {
        failedCount++;
        continue;
      }

      // 2. Apply the resolution (overwrite Notion)
      const applyResult = await applyConflictResolution(notion, conflict.id);

      if (applyResult.success) {
        resolvedCount++;
      } else {
        console.error(`Failed to apply resolution for conflict ${conflict.id}:`, applyResult.error);
        failedCount++;
      }
    }

    return {
      success: true,
      message: `Resolved ${resolvedCount} conflicts, ${failedCount} failed`,
      resolvedCount,
      failedCount,
    };
  } catch (error) {
    console.error("Error auto-resolving conflicts:", error);
    return {
      success: false,
      error: "Failed to auto-resolve conflicts",
      resolvedCount: 0,
      failedCount: 0,
    };
  }
}

/**
 * Ignore a conflict (mark as resolved without action)
 */
export async function ignoreConflict(conflictId: string) {
  try {
    const session = await getVerifiedSession();

    await db
      .update(notionSyncConflicts)
      .set({
        resolution: "ignored",
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        autoResolved: false,
      })
      .where(
        and(
          eq(notionSyncConflicts.id, conflictId),
          eq(notionSyncConflicts.userId, session.user.id)
        )
      );

    return {
      success: true,
      message: "Conflict ignored",
    };
  } catch (error) {
    console.error("Error ignoring conflict:", error);
    return {
      success: false,
      error: "Failed to ignore conflict",
    };
  }
}

/**
 * Get conflict statistics
 */
export async function getConflictStats() {
  try {
    const session = await getVerifiedSession();

    const allConflicts = await db
      .select()
      .from(notionSyncConflicts)
      .where(eq(notionSyncConflicts.userId, session.user.id));

    const stats = {
      total: allConflicts.length,
      pending: allConflicts.filter((c) => c.resolution === "pending").length,
      resolved: allConflicts.filter((c) => c.resolution !== "pending").length,
      appWins: allConflicts.filter((c) => c.resolution === "app_wins").length,
      notionWins: allConflicts.filter((c) => c.resolution === "notion_wins")
        .length,
      merged: allConflicts.filter((c) => c.resolution === "merged").length,
      ignored: allConflicts.filter((c) => c.resolution === "ignored").length,
      autoResolved: allConflicts.filter((c) => c.autoResolved).length,
      byType: {
        edit: allConflicts.filter((c) => c.conflictType === "edit").length,
        delete: allConflicts.filter((c) => c.conflictType === "delete").length,
        permission: allConflicts.filter((c) => c.conflictType === "permission")
          .length,
        structure: allConflicts.filter((c) => c.conflictType === "structure")
          .length,
      },
    };

    return {
      success: true,
      stats,
    };
  } catch (error) {
    console.error("Error getting conflict stats:", error);
    return {
      success: false,
      error: "Failed to get conflict statistics",
      stats: null,
    };
  }
}

/**
 * Delete old resolved conflicts
 */
export async function cleanupResolvedConflicts(daysOld = 30) {
  try {
    const session = await getVerifiedSession();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Only delete resolved conflicts older than cutoff
    const result = await db
      .delete(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.userId, session.user.id),
          ne(notionSyncConflicts.resolution, "pending"),
          lte(notionSyncConflicts.resolvedAt, cutoffDate)
        )
      );

    return {
      success: true,
      message: "Old conflicts cleaned up",
    };
  } catch (error) {
    console.error("Error cleaning up conflicts:", error);
    return {
      success: false,
      error: "Failed to cleanup conflicts",
    };
  }
}
