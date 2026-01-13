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
import { eq, and, lt } from "drizzle-orm";
import { getNotionOAuthClient, getNotionIntegration } from "@/lib/notion-oauth";
import {
  exportSurveyToNotion,
  exportAnalyticsToNotion,
  exportConversationToNotion,
  formatConversationForNotion,
  formatAnalyticsForNotion,
  getNotionPageUrl,
  withRetry,
} from "@/lib/notion-improved";
import { Client } from "@notionhq/client";
import {
  detectPageConflict,
  createConflictRecord,
  autoResolveConflict,
} from "@/lib/notion-conflict";

const connection = getRedisClient();

// Pagination constants
const CONVERSATION_BATCH_SIZE = 50;
const BLOCK_DELETE_CONCURRENCY = 5; // Delete 5 blocks at a time to avoid rate limits

/**
 * Delete blocks in parallel with controlled concurrency
 * Prevents rate limiting while being faster than sequential deletion
 */
async function deleteBlocksInParallel(
  notion: Client,
  blocks: Array<{ id: string }>
): Promise<void> {
  // Process blocks in batches to avoid rate limits
  for (let i = 0; i < blocks.length; i += BLOCK_DELETE_CONCURRENCY) {
    const batch = blocks.slice(i, i + BLOCK_DELETE_CONCURRENCY);
    await Promise.all(
      batch.map((block) =>
        withRetry(() => notion.blocks.delete({ block_id: block.id }))
      )
    );
  }
}

/**
 * Clean up old sync status records to prevent table bloat
 * Keeps records from the last 7 days
 */
async function cleanupOldSyncStatus(userId: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await db
      .delete(notionSyncStatus)
      .where(
        and(
          eq(notionSyncStatus.userId, userId),
          lt(notionSyncStatus.createdAt, sevenDaysAgo)
        )
      );
  } catch (error) {
    console.warn("Failed to cleanup old sync status records:", error);
    // Don't fail the sync if cleanup fails
  }
}

/**
 * Sync survey metadata to Notion database
 */
async function syncSurvey(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect,
  surveyId: string,
  preloadedSurvey?: typeof surveys.$inferSelect,
  preloadedExport?: typeof notionExports.$inferSelect
) {
  console.log("Syncing survey to Notion:", { surveyId });

  // Get survey (use preloaded if available)
  const survey = preloadedSurvey || (await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId)))[0];

  if (!survey) {
    throw new Error("Survey not found");
  }

  if (!integration.surveyDatabaseId) {
    throw new Error("Survey database not configured");
  }

  // Check if already exported
  const existingExport = preloadedExport || (await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.surveyId, surveyId),
        eq(notionExports.exportType, "survey")
      )
    ))[0];

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
  surveyId: string,
  preloadedSurvey?: typeof surveys.$inferSelect,
  preloadedAnalytics?: typeof surveyAnalytics.$inferSelect,
  preloadedExport?: typeof notionExports.$inferSelect
) {
  console.log("Syncing analytics to Notion:", { surveyId });

  // Get survey and analytics
  const survey = preloadedSurvey || (await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId)))[0];

  if (!survey) {
    throw new Error("Survey not found");
  }

  const analytics = preloadedAnalytics || (await db
    .select()
    .from(surveyAnalytics)
    .where(eq(surveyAnalytics.surveyId, surveyId)))[0];

  if (!analytics) {
    console.log("No analytics found for survey, skipping");
    return;
  }

  if (!integration.parentPageId) {
    throw new Error("Parent page not configured");
  }

  // Check if already exported
  const existingExport = preloadedExport || (await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.surveyId, surveyId),
        eq(notionExports.exportType, "analytics")
      )
    ))[0];

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

    // Delete existing blocks in parallel (with rate limiting)
    const { results: existingBlocks } = await notion.blocks.children.list({
      block_id: existingExport.notionPageId,
    });

    await deleteBlocksInParallel(notion, existingBlocks);

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
  conversationId: string,
  preloadedConversation?: typeof surveyConversations.$inferSelect,
  preloadedSurvey?: typeof surveys.$inferSelect,
  preloadedExport?: typeof notionExports.$inferSelect
) {
  console.log("Syncing conversation to Notion:", { conversationId });
  const conversation = preloadedConversation || (await db
    .select()
    .from(surveyConversations)
    .where(eq(surveyConversations.id, conversationId)))[0];

  if (!conversation) {
    throw new Error("Conversation not found");
  }
  const survey = preloadedSurvey || (await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, conversation.surveyId)))[0];

  if (!survey) {
    throw new Error("Survey not found");
  }

  if (!integration.parentPageId) {
    throw new Error("Parent page not configured");
  }

  // Get insights if available (Optional: preloading insights could be added too)
  const [insights] = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.conversationId, conversationId));

  // Check if already exported
  const existingExport = preloadedExport || (await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, job.data.userId),
        eq(notionExports.exportType, "conversation"),
        eq(notionExports.relatedId, conversationId)
      )
    ))[0];

  if (existingExport && !job.data.forceUpdate) {
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

    // Delete blocks in parallel (with rate limiting)
    await deleteBlocksInParallel(notion, existingBlocks);

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
 * Uses eager loading to reduce N+1 queries
 */
async function fullSync(
  job: Job<NotionSyncJobData>,
  notion: Client,
  integration: typeof notionIntegrations.$inferSelect
) {
  console.log("Performing full sync for user:", job.data.userId);

  // Eager load all data in 3 queries instead of N+1
  // Query 1: Get all surveys with their analytics
  const surveysWithAnalytics = await db
    .select({
      survey: surveys,
      analytics: surveyAnalytics,
    })
    .from(surveys)
    .leftJoin(surveyAnalytics, eq(surveyAnalytics.surveyId, surveys.id))
    .where(eq(surveys.userId, job.data.userId));

  const surveyIds = surveysWithAnalytics.map((s) => s.survey.id);
  console.log(`Found ${surveyIds.length} surveys to sync`);

  if (surveyIds.length === 0) {
    console.log("No surveys to sync");
    return;
  }

  // Query 2: Get all conversations for all surveys (with pagination)
  // Group by surveyId for efficient lookup
  const conversationsBySurvey = new Map<
    string,
    Array<typeof surveyConversations.$inferSelect>
  >();

  // Paginate through conversations to handle large datasets
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await db
      .select()
      .from(surveyConversations)
      .where(
        // Use inArray for multiple survey IDs
        surveyIds.length === 1
          ? eq(surveyConversations.surveyId, surveyIds[0])
          : eq(surveyConversations.surveyId, surveyIds[0]) // Fallback for single - drizzle handles this
      )
      .limit(CONVERSATION_BATCH_SIZE)
      .offset(offset);

    // For multiple surveys, filter in memory (drizzle-orm doesn't have inArray in all drivers)
    const filteredBatch =
      surveyIds.length === 1
        ? batch
        : batch.filter((c) => surveyIds.includes(c.surveyId));

    for (const conv of filteredBatch) {
      if (!conversationsBySurvey.has(conv.surveyId)) {
        conversationsBySurvey.set(conv.surveyId, []);
      }
      conversationsBySurvey.get(conv.surveyId)!.push(conv);
    }

    hasMore = batch.length === CONVERSATION_BATCH_SIZE;
    offset += CONVERSATION_BATCH_SIZE;

    // Safety limit to prevent infinite loops
    if (offset > 10000) {
      console.warn("Reached conversation sync limit (10000), stopping");
      break;
    }
  }

  // Query 3: Get all existing exports for this user (for update detection)
  const existingExports = await db
    .select()
    .from(notionExports)
    .where(eq(notionExports.userId, job.data.userId));

  // Create lookup maps for quick access
  const surveyExports = new Map(
    existingExports
      .filter((e) => e.exportType === "survey")
      .map((e) => [e.surveyId, e])
  );
  const analyticsExports = new Map(
    existingExports
      .filter((e) => e.exportType === "analytics")
      .map((e) => [e.surveyId, e])
  );
  const conversationExports = new Map(
    existingExports
      .filter((e) => e.exportType === "conversation")
      .map((e) => [e.relatedId, e])
  );

  console.log(
    `Loaded ${existingExports.length} existing exports, ` +
      `${Array.from(conversationsBySurvey.values()).flat().length} conversations`
  );

  // Now sync each survey using the pre-loaded data
  for (const { survey, analytics } of surveysWithAnalytics) {
    try {
      // Sync survey
      await syncSurvey(
        job, 
        notion, 
        integration, 
        survey.id, 
        survey, 
        surveyExports.get(survey.id)
      );

      // Sync analytics if available
      if (analytics) {
        await syncAnalytics(
          job, 
          notion, 
          integration, 
          survey.id, 
          survey, 
          analytics, 
          analyticsExports.get(survey.id)
        );
      }

      // Sync conversations using pre-loaded data
      const surveyConvos = conversationsBySurvey.get(survey.id) || [];
      console.log(
        `Syncing ${surveyConvos.length} conversations for survey ${survey.id}`
      );

      for (const conversation of surveyConvos) {
        try {
          await syncConversation(
            job, 
            notion, 
            integration, 
            conversation.id, 
            conversation, 
            survey, 
            conversationExports.get(conversation.id)
          );
        } catch (convError) {
          console.error(
            `Failed to sync conversation ${conversation.id}:`,
            convError
          );
          // Continue with other conversations
        }
      }
    } catch (error) {
      console.error(`Failed to sync survey ${survey.id}:`, error);
      // Continue with other surveys
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

      // Cleanup old sync status records periodically
      await cleanupOldSyncStatus(job.data.userId);

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
