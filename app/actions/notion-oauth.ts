"use server";

/**
 * Notion OAuth Integration Actions
 *
 * Server actions for managing OAuth integration, sync settings,
 * and manual sync operations
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { notionIntegrations, notionSyncStatus, surveys } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  getNotionIntegration,
  updateSyncSettings,
  disconnectOAuthIntegration,
  hasOAuthIntegration,
} from "@/lib/notion-oauth";
import { enqueueNotionSync } from "@/lib/queue";

/**
 * Get Notion OAuth integration status
 */
export async function getNotionOAuthStatus() {
  try {
    const session = await getVerifiedSession();

    const integration = await getNotionIntegration(session.user.id);

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
  syncType: "survey" | "analytics" | "conversations" | "full" = "full"
) {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return {
        success: false,
        error: "Survey not found",
      };
    }

    if (survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const hasIntegration = await hasOAuthIntegration(session.user.id);
    if (!hasIntegration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }


    const job = await enqueueNotionSync({
      userId: session.user.id,
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

    // Queue full sync job
    const job = await enqueueNotionSync({
      userId: session.user.id,
      syncType: "full",
      forceUpdate: true,
    });

    return {
      success: true,
      message: "Full sync triggered successfully",
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

    let query = db
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
      .where(eq(notionSyncStatus.userId, session.user.id));

    if (surveyId) {
      query = query.where(
        and(
          eq(notionSyncStatus.userId, session.user.id),
          eq(notionSyncStatus.surveyId, surveyId)
        )
      );
    }

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

    const allStatuses = await db
      .select()
      .from(notionSyncStatus)
      .where(eq(notionSyncStatus.userId, session.user.id));

    const stats = {
      total: allStatuses.length,
      completed: allStatuses.filter((s) => s.status === "completed").length,
      failed: allStatuses.filter((s) => s.status === "failed").length,
      pending: allStatuses.filter((s) => s.status === "pending").length,
      processing: allStatuses.filter((s) => s.status === "processing").length,
    };

    const integration = await getNotionIntegration(session.user.id);

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
