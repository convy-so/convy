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
  createSurveyDatabase,
  getNotionPageUrl,
} from "@/lib/notion-improved";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * Get user's Notion integration status
 */
export async function getNotionIntegrationStatus() {
  try {
    const session = await getVerifiedSession();

    const [integration] = await db
      .select({
        id: notionIntegrations.id,
        workspaceName: notionIntegrations.workspaceName,
        parentPageId: notionIntegrations.parentPageId,
        surveyDatabaseId: notionIntegrations.surveyDatabaseId,
        createdAt: notionIntegrations.createdAt,
      })
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

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
 * Configure Notion integration
 */
export async function configureNotionIntegration(data: {
  notionToken: string;
  parentPageId?: string;
  workspaceName?: string;
}) {
  try {
    const session = await getVerifiedSession();
    const { notionToken, parentPageId, workspaceName } = data;

    if (!notionToken) {
      return {
        success: false,
        error: "Notion token is required",
      };
    }

    // Test the token
    const notion = getNotionClient(notionToken);

    try {
      await notion.users.me({});
    } catch (error) {
      return {
        success: false,
        error: "Invalid Notion token",
      };
    }

    // Get existing integration
    const [existingIntegration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    let surveyDatabaseId = existingIntegration?.surveyDatabaseId || null;

    // Create survey database if parent page is provided
    if (parentPageId && !surveyDatabaseId) {
      try {
        const database = await createSurveyDatabase(
          notion,
          parentPageId,
          "Surveys"
        );
        surveyDatabaseId = database.id;
      } catch (error) {
        console.error("Failed to create survey database:", error);
      }
    }

    // Encrypt the token for secure storage (required by schema)
    const encryptedToken = encrypt(notionToken);

    if (existingIntegration) {
      await db
        .update(notionIntegrations)
        .set({
          accessToken: encryptedToken.encrypted,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          parentPageId: parentPageId || existingIntegration.parentPageId,
          workspaceName: workspaceName || existingIntegration.workspaceName,
          surveyDatabaseId:
            surveyDatabaseId || existingIntegration.surveyDatabaseId,
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      await db.insert(notionIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        accessToken: encryptedToken.encrypted,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.tag,
        parentPageId: parentPageId || null,
        workspaceName: workspaceName || null,
        surveyDatabaseId: surveyDatabaseId,
      });
    }

    return {
      success: true,
      message: "Notion integration configured successfully",
      surveyDatabaseId,
    };
  } catch (error) {
    console.error("Error configuring Notion integration:", error);
    return {
      success: false,
      error: "Failed to configure Notion integration",
    };
  }
}

/**
 * Disconnect Notion integration
 */
export async function disconnectNotionIntegration() {
  try {
    const session = await getVerifiedSession();

    await db
      .delete(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

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

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

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

    if (survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
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

    // Save export record
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

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

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

    if (survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
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

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

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

    if (survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
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

    if (survey.userId !== session.user.id) {
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
