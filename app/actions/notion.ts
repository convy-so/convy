"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  surveys,
  surveyAnalytics,
  surveyConversations,
  notionIntegrations,
  notionExports,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getNotionClient,
  exportSurveyToNotion,
  exportAnalyticsToNotion,
  exportConversationToNotion,
  getNotionPageUrl,
} from "@/lib/notion-improved";
import { decrypt } from "@/lib/encryption";
import {
  getWorkspaceOwnerId,
  isWorkspaceOwner,
} from "@/lib/workspace-access";

/**
 * Get user's Notion integration status
 * Considers active workspace context
 */
export async function getNotionIntegrationStatus() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const [integration] = await db
      .select({
        id: notionIntegrations.id,
        workspaceName: notionIntegrations.workspaceName,
        parentPageId: notionIntegrations.parentPageId,
        surveyDatabaseId: notionIntegrations.surveyDatabaseId,
        createdAt: notionIntegrations.createdAt,
      })
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, targetUserId));

    return {
      success: true,
      connected: !!integration,
      integration: integration || null,
    };
  } catch (error) {
    console.error("Error getting Notion integration status:", error);
    return {
      success: false,
      error: "Failed to get Notion integration status",
      connected: false,
      integration: null,
    };
  }
}

/**
 * Disconnect Notion integration
 * Restricted to workspace owner if in workspace context
 */
export async function disconnectNotionIntegration() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    await db
      .delete(notionIntegrations)
      .where(eq(notionIntegrations.userId, targetUserId));

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
 * Export survey to Notion
 */
export async function exportSurveyToNotionAction(
  surveyId: string,
  databaseId?: string
) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    // Get integration (from target user / owner)
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, targetUserId));

    if (!integration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // Get survey
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

    // For accessing the survey itself, standard permissions apply
    // (Checked implicitly? No, we should check access level ideally, keeping existing logic for now which checked userId)
    // Original logic: if (survey.userId !== session.user.id) return Unauthorized
    // We should probably rely on proper access control here if available, but let's stick to the authorized user check 
    // BUT valid for workspace context too.
    
    // Check if user has access to this survey
    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const accessLevel = await getSurveyAccessLevel(session.user.id, surveyId);
    
    if (accessLevel === "none") {
      return {
        success: false,
        error: "Unauthorized access to survey",
      };
    }

    const targetDatabaseId = databaseId || integration.surveyDatabaseId;

    if (!targetDatabaseId) {
      return {
        success: false,
        error: "No database ID configured",
      };
    }

    // Export to Notion - decrypt the access token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );
    const notion = getNotionClient(accessToken);
    const notionPage = await exportSurveyToNotion(
      notion,
      targetDatabaseId,
      survey
    );

    // Save export record (Associated with the ACTOR, i.e., current user)
    const notionUrl = getNotionPageUrl(notionPage);
    await db.insert(notionExports).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      surveyId: survey.id,
      exportType: "survey",
      notionPageId: notionPage.id,
      notionUrl,
    });

    return {
      success: true,
      message: "Survey exported to Notion successfully",
      notionUrl,
      notionPageId: notionPage.id,
    };
  } catch (error) {
    console.error("Error exporting survey to Notion:", error);
    return {
      success: false,
      error: "Failed to export survey to Notion",
    };
  }
}

/**
 * Export analytics to Notion
 */
export async function exportAnalyticsToNotionAction(
  surveyId: string,
  parentPageId?: string
) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, targetUserId));

    if (!integration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // Get survey
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

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const accessLevel = await getSurveyAccessLevel(session.user.id, surveyId);
    
    if (accessLevel === "none") {
      return {
        success: false,
        error: "Unauthorized access to survey",
      };
    }

    // Get analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      return {
        success: false,
        error: "Analytics not found for this survey",
      };
    }

    const targetParentPageId = parentPageId || integration.parentPageId;

    if (!targetParentPageId) {
      return {
        success: false,
        error: "No parent page ID configured",
      };
    }

    // Export to Notion - decrypt the access token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );
    const notion = getNotionClient(accessToken);
    const notionPage = await exportAnalyticsToNotion(
      notion,
      targetParentPageId,
      survey.title,
      {
        overallSummary: analytics.overallSummary,
        totalConversations: analytics.totalConversations,
        averageConversationLength: analytics.averageConversationLength,
        metrics: analytics.metrics,
      }
    );

    const notionUrl = getNotionPageUrl(notionPage);
    await db.insert(notionExports).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      surveyId: survey.id,
      exportType: "analytics",
      notionPageId: notionPage.id,
      notionUrl,
    });

    return {
      success: true,
      message: "Analytics exported to Notion successfully",
      notionUrl,
      notionPageId: notionPage.id,
    };
  } catch (error) {
    console.error("Error exporting analytics to Notion:", error);
    return {
      success: false,
      error: "Failed to export analytics to Notion",
    };
  }
}

/**
 * Export conversation to Notion
 */
export async function exportConversationToNotionAction(
  conversationId: string,
  parentPageId?: string
) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, targetUserId));

    if (!integration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // Get conversation
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return {
        success: false,
        error: "Conversation not found",
      };
    }

    // Get survey
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return {
        success: false,
        error: "Survey not found",
      };
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const accessLevel = await getSurveyAccessLevel(session.user.id, survey.id);
    
    if (accessLevel === "none") {
      return {
        success: false,
        error: "Unauthorized access to survey",
      };
    }

    const targetParentPageId = parentPageId || integration.parentPageId;

    if (!targetParentPageId) {
      return {
        success: false,
        error: "No parent page ID configured",
      };
    }

    // Export to Notion - decrypt the access token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );
    const notion = getNotionClient(accessToken);
    const notionPage = await exportConversationToNotion(
      notion,
      targetParentPageId,
      survey.title,
      {
        id: conversation.id,
        messages: conversation.rawConversation,
        summary: conversation.summary,
        completed: conversation.completed,
        createdAt: conversation.createdAt,
      }
    );

    // Save export record
    const notionUrl = getNotionPageUrl(notionPage);
    await db.insert(notionExports).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      surveyId: survey.id,
      exportType: "conversation",
      notionPageId: notionPage.id,
      notionUrl,
    });

    return {
      success: true,
      message: "Conversation exported to Notion successfully",
      notionUrl,
      notionPageId: notionPage.id,
    };
  } catch (error) {
    console.error("Error exporting conversation to Notion:", error);
    return {
      success: false,
      error: "Failed to export conversation to Notion",
    };
  }
}

/**
 * Get all Notion exports for a user
 */
export async function getNotionExports() {
  try {
    const session = await getVerifiedSession();

    const exports = await db
      .select({
        id: notionExports.id,
        surveyId: notionExports.surveyId,
        exportType: notionExports.exportType,
        notionPageId: notionExports.notionPageId,
        notionUrl: notionExports.notionUrl,
        createdAt: notionExports.createdAt,
        surveyTitle: surveys.title,
      })
      .from(notionExports)
      .leftJoin(surveys, eq(notionExports.surveyId, surveys.id))
      .where(eq(notionExports.userId, session.user.id))
      .orderBy(notionExports.createdAt);

    return {
      success: true,
      exports,
    };
  } catch (error) {
    console.error("Error getting Notion exports:", error);
    return {
      success: false,
      error: "Failed to get Notion exports",
      exports: [],
    };
  }
}

/**
 * Get Notion exports for a specific survey
 */
export async function getSurveyNotionExports(surveyId: string) {
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
        exports: [],
      };
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const accessLevel = await getSurveyAccessLevel(session.user.id, surveyId);
    
    if (accessLevel === "none") {
      return {
        success: false,
        error: "Unauthorized",
        exports: [],
      };
    }

    const exports = await db
      .select({
        id: notionExports.id,
        exportType: notionExports.exportType,
        notionPageId: notionExports.notionPageId,
        notionUrl: notionExports.notionUrl,
        createdAt: notionExports.createdAt,
      })
      .from(notionExports)
      .where(eq(notionExports.surveyId, surveyId))
      .orderBy(notionExports.createdAt);

    return {
      success: true,
      exports,
    };
  } catch (error) {
    console.error("Error getting survey Notion exports:", error);
    return {
      success: false,
      error: "Failed to get survey Notion exports",
      exports: [],
    };
  }
}
