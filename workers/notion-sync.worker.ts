import { Worker, Job } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { NotionSyncJobData } from "@/lib/queue";
import { db } from "@/db";
import {
  surveys,
  surveyAnalytics,
  surveyConversations,
  conversationInsights,
  notionIntegrations,
  notionExports,
  notionSyncStatus,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getNotionOAuthClient, getNotionIntegration } from "@/lib/notion-oauth";
import {
  exportSurveyToNotion,
  exportAnalyticsToNotion,
  exportConversationToNotion,
  formatConversationForNotion,
  formatAnalyticsForNotion,
} from "@/lib/notion";
import { Client } from "@notionhq/client";
import {
  detectPageConflict,
  createConflictRecord,
  autoResolveConflict,
} from "@/lib/notion-conflict";

const connection = getRedisClient();

/**
 * Helper function to safely get URL from Notion page response
 * Handles both PageObjectResponse and PartialPageObjectResponse types
 */
function getNotionPageUrl(page: { id: string } & { url?: string }): string {
  // Type guard: check if url property exists
  if ("url" in page && page.url) {
    return page.url;
  }
  // Construct URL from page ID if not provided
  // Format: https://www.notion.so/{page-id-with-hyphens}
  const pageIdWithHyphens = [
    page.id.slice(0, 8),
    page.id.slice(8, 12),
    page.id.slice(12, 16),
    page.id.slice(16, 20),
    page.id.slice(20, 32),
  ].join("-");
  return `https://www.notion.so/${pageIdWithHyphens}`;
}

/**
 * Sync survey metadata to Notion database
 */
async function syncSurvey(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect,
  surveyId: string
) {
  console.log("Syncing survey to Notion:", { surveyId });

  // Get survey
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    throw new Error("Survey not found");
  }

  if (!integration.surveyDatabaseId) {
    throw new Error("Survey database not configured");
  }

  // Check if already exported
  const [existingExport] = await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.surveyId, surveyId),
        eq(notionExports.exportType, "survey")
      )
    );

  if (existingExport && !job.data.forceUpdate) {
    console.log("Updating existing survey page:", existingExport.notionPageId);

    await notion.pages.update({
      page_id: existingExport.notionPageId,
      properties: {
        Status: {
          select: {
            name: survey.status,
          },
        },
        "Updated At": {
          date: {
            start: survey.updatedAt.toISOString(),
          },
        },
        "Last Synced": {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    });
  } else {
    console.log("Creating new survey page");

    const page = await exportSurveyToNotion(
      notion,
      integration.surveyDatabaseId,
      survey
    );

    if (!existingExport) {
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: job.data.userId,
        surveyId: survey.id,
        exportType: "survey",
        notionPageId: page.id,
        notionUrl: getNotionPageUrl(page),
      });
    } else {
      await db
        .update(notionExports)
        .set({
          notionPageId: page.id,
          notionUrl: getNotionPageUrl(page),
          updatedAt: new Date(),
        })
        .where(eq(notionExports.id, existingExport.id));
    }
  }
}

/**
 * Sync analytics to Notion page
 */
async function syncAnalytics(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect,
  surveyId: string
) {
  console.log("Syncing analytics to Notion:", { surveyId });

  // Get survey and analytics
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    throw new Error("Survey not found");
  }

  const [analytics] = await db
    .select()
    .from(surveyAnalytics)
    .where(eq(surveyAnalytics.surveyId, surveyId));

  if (!analytics) {
    console.log("No analytics found for survey, skipping");
    return;
  }

  if (!integration.parentPageId) {
    throw new Error("Parent page not configured");
  }

  // Check if already exported
  const [existingExport] = await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.surveyId, surveyId),
        eq(notionExports.exportType, "analytics")
      )
    );

  if (existingExport && !job.data.forceUpdate) {
    // Update existing page - replace all blocks
    console.log(
      "Updating existing analytics page:",
      existingExport.notionPageId
    );

    const blocks = formatAnalyticsForNotion({
      overallSummary: analytics.overallSummary,
      totalConversations: analytics.totalConversations,
      averageConversationLength: analytics.averageConversationLength,
      metrics: analytics.metrics,
    });

    // Delete existing blocks
    const { results: existingBlocks } = await notion.blocks.children.list({
      block_id: existingExport.notionPageId,
    });

    for (const block of existingBlocks) {
      await notion.blocks.delete({ block_id: block.id });
    }

    // Add new blocks
    await notion.blocks.children.append({
      block_id: existingExport.notionPageId,
      children: blocks,
    });

    // Update page title
    await notion.pages.update({
      page_id: existingExport.notionPageId,
      properties: {
        title: {
          title: [
            {
              text: {
                content: `${survey.title} - Analytics (Updated ${new Date().toLocaleDateString()})`,
              },
            },
          ],
        },
      },
    });
  } else {
    console.log("Creating new analytics page");

    const page = await exportAnalyticsToNotion(
      notion,
      integration.parentPageId,
      survey.title,
      {
        overallSummary: analytics.overallSummary,
        totalConversations: analytics.totalConversations,
        averageConversationLength: analytics.averageConversationLength,
        metrics: analytics.metrics,
      }
    );

    if (!existingExport) {
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: job.data.userId,
        surveyId: survey.id,
        exportType: "analytics",
        notionPageId: page.id,
        notionUrl: getNotionPageUrl(page),
      });
    } else {
      await db
        .update(notionExports)
        .set({
          notionPageId: page.id,
          notionUrl: getNotionPageUrl(page),
          updatedAt: new Date(),
        })
        .where(eq(notionExports.id, existingExport.id));
    }
  }
}

/**
 * Sync conversation to Notion page
 */
async function syncConversation(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect,
  conversationId: string
) {

  console.log("Syncing conversation to Notion:", { conversationId });
  const [conversation] = await db
    .select()
    .from(surveyConversations)
    .where(eq(surveyConversations.id, conversationId));

  if (!conversation) {
    throw new Error("Conversation not found");
  }
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, conversation.surveyId));

  if (!survey) {
    throw new Error("Survey not found");
  }

  if (!integration.parentPageId) {
    throw new Error("Parent page not configured");
  }

  // Get insights if available
  const [insights] = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.conversationId, conversationId));

  // Check if already exported
  const [existingExport] = await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.exportType, "conversation"),
        eq(notionExports.relatedId, conversationId)
      )
    );

  if (existingExport && !job.data.forceUpdate) {
    // Check for conflicts before updating
    const conflictCheck = await detectPageConflict(
      notion,
      existingExport.notionPageId,
      {
        lastModified: conversation.updatedAt,
        content: conversation,
      }
    );

    if (conflictCheck.hasConflict) {
      console.log("Conflict detected for conversation:", conversationId);

      // Create conflict record
      const conflictId = await createConflictRecord({
        userId: job.data.userId,
        resourceType: "conversation",
        resourceId: conversationId,
        notionPageId: existingExport.notionPageId,
        conflictType: conflictCheck.conflictType!,
        appVersion: { conversation },
        notionVersion: conflictCheck.notionData as Record<string, unknown>,
        conflictDetails: {
          appLastModified: conversation.updatedAt.toISOString(),
          deletedInNotion: conflictCheck.conflictType === "delete",
        },
      });

      // Try to auto-resolve
      await autoResolveConflict(conflictId, job.data.userId);

      console.log("Conflict auto-resolved:", conflictId);
      return; 
    }

    // Update existing page - replace all blocks
    console.log(
      "Updating existing conversation page:",
      existingExport.notionPageId
    );

    const blocks = formatConversationForNotion({
      id: conversation.id,
      messages: conversation.rawConversation,
      summary: conversation.summary,
      completed: conversation.completed,
      createdAt: conversation.createdAt,
    });

    const { results: existingBlocks } = await notion.blocks.children.list({
      block_id: existingExport.notionPageId,
    });

    for (const block of existingBlocks) {
      await notion.blocks.delete({ block_id: block.id });
    }
    await notion.blocks.children.append({
      block_id: existingExport.notionPageId,
      children: blocks,
    });
  } else {
    console.log("Creating new conversation page");

    const page = await exportConversationToNotion(
      notion,
      integration.parentPageId,
      survey.title,
      {
        id: conversation.id,
        messages: conversation.rawConversation,
        summary: conversation.summary,
        completed: conversation.completed,
        createdAt: conversation.createdAt,
      }
    );

    if (!existingExport) {
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: job.data.userId,
        surveyId: survey.id,
        exportType: "conversation",
        relatedId: conversationId,
        notionPageId: page.id,
        notionUrl: getNotionPageUrl(page),
      });
    } else {
      await db
        .update(notionExports)
        .set({
          notionPageId: page.id,
          notionUrl: getNotionPageUrl(page),
          updatedAt: new Date(),
        })
        .where(eq(notionExports.id, existingExport.id));
    }
  }
}

/**
 * Full sync - sync everything for all surveys
 */
async function fullSync(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect
) {
  console.log("Performing full sync for user:", job.data.userId);

  const userSurveys = await db
    .select()
    .from(surveys)
    .where(eq(surveys.userId, job.data.userId));

  console.log(`Found ${userSurveys.length} surveys to sync`);

  for (const survey of userSurveys) {
    try {
      await syncSurvey(job, notion, integration, survey.id);

      const [analytics] = await db
        .select()
        .from(surveyAnalytics)
        .where(eq(surveyAnalytics.surveyId, survey.id));

      if (analytics) {
        await syncAnalytics(job, notion, integration, survey.id);
      }

      const conversations = await db
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.surveyId, survey.id));

      console.log(
        `Found ${conversations.length} conversations to sync for survey ${survey.id}`
      );

      for (const conversation of conversations) {
        await syncConversation(job, notion, integration, conversation.id);
      }
    } catch (error) {
      console.error(`Failed to sync survey ${survey.id}:`, error);
    }
  }

  console.log("Full sync completed");
}

/**
 * Main worker processor
 */
const worker = new Worker<NotionSyncJobData>(
  "notion-sync",
  async (job) => {
    console.log("Processing Notion sync job:", {
      jobId: job.id,
      syncType: job.data.syncType,
      userId: job.data.userId,
      surveyId: job.data.surveyId,
      targetId: job.data.targetId,
    });

    const syncStatusId = crypto.randomUUID();
    await db.insert(notionSyncStatus).values({
      id: syncStatusId,
      userId: job.data.userId,
      surveyId: job.data.surveyId || null,
      syncType: job.data.syncType,
      status: "processing",
      jobId: job.id || null,
      targetId: job.data.targetId || null,
    });

    try {
      const integration = await getNotionIntegration(job.data.userId);

      if (!integration) {
        throw new Error("No Notion integration found for user");
      }

      if (!integration.autoSync && !job.data.forceUpdate) {
        console.log("Auto-sync is disabled, skipping");
        await db
          .update(notionSyncStatus)
          .set({
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(notionSyncStatus.id, syncStatusId));
        return;
      }

      const notion = await getNotionOAuthClient(job.data.userId);

      if (!notion) {
        throw new Error("Failed to create Notion client");
      }

      switch (job.data.syncType) {
        case "survey":
          if (!job.data.surveyId) {
            throw new Error("Survey ID required for survey sync");
          }
          await syncSurvey(job, notion, integration, job.data.surveyId);
          break;

        case "analytics":
          if (!job.data.surveyId) {
            throw new Error("Survey ID required for analytics sync");
          }
          await syncAnalytics(job, notion, integration, job.data.surveyId);
          break;

        case "conversation":
          if (!job.data.targetId) {
            throw new Error("Conversation ID required for conversation sync");
          }
          await syncConversation(job, notion, integration, job.data.targetId);
          break;

        case "full":
          await fullSync(job, notion, integration);
          break;

        default:
          throw new Error(`Unknown sync type: ${job.data.syncType}`);
      }

      await db
        .update(notionIntegrations)
        .set({
          lastSyncedAt: new Date(),
        })
        .where(eq(notionIntegrations.userId, job.data.userId));

      await db
        .update(notionSyncStatus)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(notionSyncStatus.id, syncStatusId));

      console.log("Notion sync completed successfully:", {
        jobId: job.id,
        syncType: job.data.syncType,
      });
    } catch (error) {
      console.error("Notion sync failed:", error);

      await db
        .update(notionSyncStatus)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(notionSyncStatus.id, syncStatusId));

      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Notion sync job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Notion sync job ${job?.id} failed:`, err);
});

worker.on("error", (err) => {
  console.error("❌ Notion sync worker error:", err);
});

console.log("🔄 Notion Sync Worker started");

export default worker;
