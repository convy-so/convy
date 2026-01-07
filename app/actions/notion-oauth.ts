"use server";

/**
 * Notion OAuth Integration Actions
 *
 * Server actions for managing OAuth integration, sync settings,
 * and manual sync operations
 */

import { getVerifiedSession } from "@/lib/auth/session";
import crypto from "crypto";
import { db } from "@/db";
import { notionSyncStatus, notionBulkOperations, surveys } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  getNotionIntegration,
  updateSyncSettings,
  disconnectOAuthIntegration,
  hasOAuthIntegration,
} from "@/lib/notion-oauth";
import {
  enqueueNotionSync,
  enqueueBulkOperation,
  ensureDefaultScheduledSync,
  scheduleNotionSyncRepeating,
  NotionSyncScheduleMode,
} from "@/lib/queue";
import {
  getWorkspaceOwnerId,
  isWorkspaceOwner,
} from "@/lib/workspace-access";

/**
 * Get Notion OAuth integration status
 */
export async function getNotionOAuthStatus() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) {
        targetUserId = ownerId;
      }
    }

    const integration = await getNotionIntegration(targetUserId);

    // Ensure a default hourly scheduled sync exists
    try {
      await ensureDefaultScheduledSync(targetUserId);
    } catch (scheduleError) {
      console.warn(
        "Failed to ensure default Notion sync schedule:",
        scheduleError
      );
    }

    return {
      success: true,
      connected: !!integration,
      integration: integration
        ? {
            id: integration.id,
            workspaceName: integration.workspaceName,
            workspaceIcon: integration.workspaceIcon,
            parentPageId: integration.parentPageId,
            surveyDatabaseId: integration.surveyDatabaseId,
            autoSync: integration.autoSync,
            syncOnNewConversation: integration.syncOnNewConversation,
            syncOnAnalyticsUpdate: integration.syncOnAnalyticsUpdate,
            lastSyncedAt: integration.lastSyncedAt,
            createdAt: integration.createdAt,
          }
        : null,
    };
  } catch (error) {
    console.error("Error getting Notion OAuth status:", error);
    return {
      success: false,
      error: "Failed to get Notion integration status",
      connected: false,
      integration: null,
    };
  }
}

/**
 * Update Notion sync settings
 */
export async function updateNotionSyncSettings(settings: {
  autoSync?: boolean;
  syncOnNewConversation?: boolean;
  syncOnAnalyticsUpdate?: boolean;
}) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
      // If owner, proceed. Note we use session.user.id as they ARE the owner.
    }

    await updateSyncSettings(session.user.id, settings);

    return {
      success: true,
      message: "Sync settings updated successfully",
    };
  } catch (error) {
    console.error("Error updating sync settings:", error);
    return {
      success: false,
      error: "Failed to update sync settings",
    };
  }
}

/**
 * Disconnect Notion OAuth integration
 */
export async function disconnectNotionOAuth() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
    }

    await disconnectOAuthIntegration(session.user.id);

    return {
      success: true,
      message: "Notion integration disconnected successfully",
    };
  } catch (error) {
    console.error("Error disconnecting Notion integration:", error);
    return {
      success: false,
      error: "Failed to disconnect Notion integration",
    };
  }
}

/**
 * Trigger manual sync for a survey
 */
export async function triggerSurveySync(
  surveyId: string,
  syncType: "survey" | "analytics" | "conversation" | "full" = "full"
) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    // Verify survey ownership or workspace access
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    // Check access
    if (activeOrgId) {
        // Must be in the same workspace
        if (survey.organizationId !== activeOrgId) {
             return { success: false, error: "Unauthorized" };
        }
    } else {
        if (survey.userId !== session.user.id) {
             return { success: false, error: "Unauthorized" };
        }
    }

    let targetUserId = session.user.id;
    if (activeOrgId) {
       const ownerId = await getWorkspaceOwnerId(activeOrgId);
       if (ownerId) targetUserId = ownerId;
    }

    const hasIntegration = await hasOAuthIntegration(targetUserId);
    if (!hasIntegration) {
      return {
        success: false,
        error: "Notion integration not configured for this workspace",
      };
    }

    const job = await enqueueNotionSync({
      userId: targetUserId,
      surveyId,
      syncType,
      forceUpdate: true,
    });

    return {
      success: true,
      message: "Sync triggered successfully",
      jobId: job.id,
    };
  } catch (error) {
    console.error("Error triggering survey sync:", error);
    return {
      success: false,
      error: "Failed to trigger sync",
    };
  }
}

/**
 * Update scheduled sync cadence
 */
export async function updateNotionSyncSchedule(params: {
  mode: NotionSyncScheduleMode;
  hourOfDay?: number;
  forceUpdate?: boolean;
}) {
  try {
    const session = await getVerifiedSession();

    const hasIntegration = await hasOAuthIntegration(session.user.id);
    if (!hasIntegration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    await scheduleNotionSyncRepeating({
      userId: session.user.id,
      mode: params.mode,
      hourOfDay: params.hourOfDay,
      forceUpdate: params.forceUpdate ?? false,
    });

    return {
      success: true,
      message: "Notion sync schedule updated",
    };
  } catch (error) {
    console.error("Error updating Notion sync schedule:", error);
    return {
      success: false,
      error: "Failed to update sync schedule",
    };
  }
}

/**
 * Trigger full sync for all surveys
 */
export async function triggerFullSync() {
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

    // Get all surveys for the user
    const userSurveys = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id));

    if (userSurveys.length === 0) {
      return {
        success: false,
        error: "No surveys found to sync",
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

    // Queue bulk operation job (uses notion-bulk-operation.worker)
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
    console.error("Error triggering full sync:", error);
    return {
      success: false,
      error: "Failed to trigger full sync",
    };
  }
}

/**
 * Get sync status/history
 */
export async function getNotionSyncHistory(surveyId?: string, limit = 20) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const conditions = [eq(notionSyncStatus.userId, targetUserId)];
    if (surveyId) {
      conditions.push(eq(notionSyncStatus.surveyId, surveyId));
    }

    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const query = db
      .select({
        id: notionSyncStatus.id,
        surveyId: notionSyncStatus.surveyId,
        syncType: notionSyncStatus.syncType,
        status: notionSyncStatus.status,
        error: notionSyncStatus.error,
        targetId: notionSyncStatus.targetId,
        createdAt: notionSyncStatus.createdAt,
        completedAt: notionSyncStatus.completedAt,
      })
      .from(notionSyncStatus)
      .where(whereClause);

    const statuses = await query
      .orderBy(desc(notionSyncStatus.createdAt))
      .limit(limit);

    return {
      success: true,
      statuses,
    };
  } catch (error) {
    console.error("Error getting sync history:", error);
    return {
      success: false,
      error: "Failed to get sync history",
      statuses: [],
    };
  }
}

/**
 * Get sync statistics
 */
export async function getNotionSyncStats() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const allStatuses = await db
      .select()
      .from(notionSyncStatus)
      .where(eq(notionSyncStatus.userId, targetUserId));

    const stats = {
      total: allStatuses.length,
      completed: allStatuses.filter((s) => s.status === "completed").length,
      failed: allStatuses.filter((s) => s.status === "failed").length,
      pending: allStatuses.filter((s) => s.status === "pending").length,
      processing: allStatuses.filter((s) => s.status === "processing").length,
    };

    const integration = await getNotionIntegration(targetUserId);

    return {
      success: true,
      stats,
      lastSyncedAt: integration?.lastSyncedAt || null,
    };
  } catch (error) {
    console.error("Error getting sync stats:", error);
    return {
      success: false,
      error: "Failed to get sync statistics",
      stats: {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        processing: 0,
      },
      lastSyncedAt: null,
    };
  }
}

/**
 * Initialize Notion structure manually
 */
export async function initializeNotionStructureAction() {
  try {
    const session = await getVerifiedSession();

    const integration = await getNotionIntegration(session.user.id);

    if (!integration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    const { initializeNotionStructure } = await import("@/lib/notion-oauth");
    const { decrypt } = await import("@/lib/encryption");

    // Decrypt token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );

    // Initialize structure
    const result = await initializeNotionStructure(
      session.user.id,
      accessToken
    );

    return {
      success: true,
      message: "Notion structure initialized successfully",
      ...result,
    };
  } catch (error) {
    console.error("Error initializing Notion structure:", error);
    return {
      success: false,
      error: "Failed to initialize Notion structure",
    };
  }
}
