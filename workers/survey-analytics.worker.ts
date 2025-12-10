import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  conversationInsights,
  surveyAnalytics,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { getOverallAnalyticsPrompt, type SurveyConfig } from "@/lib/prompts";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { SurveyAnalyticsJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const jobDataSchema = z.object({
  surveyId: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Worker for generating survey analytics
 * Aggregates all conversations and generates comprehensive analytics
 */
const surveyAnalyticsWorker = new Worker<SurveyAnalyticsJobData>(
  "survey-analytics",
  async (job: Job<SurveyAnalyticsJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { surveyId } = validatedData;

    console.log(
      `[Survey Analytics Worker] Processing job ${job.id} for survey ${surveyId}`
    );

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    await job.updateProgress(20);

    const conversations = await db
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
        rawConversation: surveyConversations.rawConversation,
        insights: conversationInsights.keyFindings,
      })
      .from(surveyConversations)
      .leftJoin(
        conversationInsights,
        eq(conversationInsights.conversationId, surveyConversations.id)
      )
      .where(eq(surveyConversations.surveyId, surveyId));

    const completedConversations = conversations.filter((c) => c.summary);

    if (completedConversations.length === 0) {
      throw new Error(
        "No completed conversations found. Generate insights for conversations first."
      );
    }

    await job.updateProgress(40);

    const surveyConfig: SurveyConfig = buildCompleteSurveyConfig(survey);

    const conversationsData = completedConversations.map((conv) => ({
      id: conv.id,
      summary: conv.summary || "",
      insights: conv.insights || "",
    }));

    const analyticsPrompt = getOverallAnalyticsPrompt(
      conversationsData,
      surveyConfig
    );
    const analyticsText = await generateAIResponse(analyticsPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 3000,
    });

    await job.updateProgress(70);

    let metrics: Record<string, unknown>;
    let overallSummary: string;

    try {
      const jsonMatch = analyticsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        metrics = JSON.parse(jsonMatch[0]);
        overallSummary = analyticsText.replace(jsonMatch[0], "").trim();
      } else {
        const summaryMatch = analyticsText.match(/^([\s\S]*?)(?:\n\n|$)/);
        overallSummary = summaryMatch ? summaryMatch[1] : analyticsText;
        metrics = {
          raw: analyticsText,
        };
      }
    } catch {
      overallSummary = analyticsText;
      metrics = {
        raw: analyticsText,
      };
    }

    const totalConversations = completedConversations.length;
    const totalMessages = completedConversations.reduce(
      (sum, conv) => sum + (conv.rawConversation?.length || 0),
      0
    );
    const averageConversationLength =
      totalConversations > 0
        ? Math.round(totalMessages / totalConversations)
        : 0;

    await job.updateProgress(90);

    const [existingAnalytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (existingAnalytics) {
      await db
        .update(surveyAnalytics)
        .set({
          overallSummary,
          metrics,
          totalConversations,
          averageConversationLength,
          lastUpdated: new Date(),
        })
        .where(eq(surveyAnalytics.surveyId, surveyId));
    } else {
      await db.insert(surveyAnalytics).values({
        id: crypto.randomUUID(),
        surveyId,
        overallSummary,
        metrics,
        totalConversations,
        averageConversationLength,
      });
    }

    await job.updateProgress(100);

    console.log(
      `[Survey Analytics Worker] Completed job ${job.id} for survey ${surveyId}`
    );

    // Reset the analytics counter after successful generation
    // This allows the system to return to accumulation mode
    try {
      const { resetAnalyticsCounterAfterGeneration } = await import(
        "@/lib/analytics-scheduler"
      );
      await resetAnalyticsCounterAfterGeneration(surveyId);
    } catch (error) {
      console.error(
        "[Survey Analytics Worker] Failed to reset analytics counter:",
        error
      );
      // Don't fail the job if counter reset fails
    }

    // Trigger Notion sync for analytics
    try {
      const { enqueueNotionSync } = await import("@/lib/queue");
      await enqueueNotionSync({
        userId: job.data.userId,
        surveyId,
        syncType: "analytics",
      });
      console.log(
        `[Survey Analytics Worker] Notion sync queued for survey ${surveyId}`
      );
    } catch (error) {
      console.error("Failed to enqueue Notion sync:", error);
      // Don't fail the job if Notion sync fails
    }

    // Trigger Slack auto-post for analytics update
    try {
      const { autoPostAnalyticsUpdate } = await import("@/app/actions/slack");
      autoPostAnalyticsUpdate(job.data.userId, surveyId).catch((error) => {
        console.error(
          `[Survey Analytics Worker] Failed to auto-post analytics to Slack:`,
          error
        );
        // Don't fail the job if Slack post fails
      });
    } catch (error) {
      console.error("Failed to import Slack auto-post function:", error);
      // Don't fail the job if import fails
    }

    // Publish analytics completion event to Redis pub/sub
    // This enables real-time updates via WebSocket
    try {
      const redis = getRedisClient();
      const channel = `analytics:complete:${surveyId}:${job.data.userId}`;
      const message = JSON.stringify({
        surveyId,
        userId: job.data.userId,
        completedAt: new Date().toISOString(),
      });

      await redis.publish(channel, message);
      console.log(
        `[Survey Analytics Worker] Published analytics completion event to channel: ${channel}`
      );
    } catch (error) {
      console.error(
        "[Survey Analytics Worker] Failed to publish analytics event to Redis:",
        error
      );
      // Don't fail the job if Redis publish fails
    }

    return {
      surveyId,
      overallSummary,
      metrics,
      totalConversations,
      averageConversationLength,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);
surveyAnalyticsWorker.on("completed", (job) => {
  console.log(`[Survey Analytics Worker] Job ${job.id} completed`);
});

surveyAnalyticsWorker.on("failed", (job, err) => {
  console.error(
    `[Survey Analytics Worker] Job ${job?.id} failed:`,
    err.message
  );
});

surveyAnalyticsWorker.on("error", (err) => {
  console.error("[Survey Analytics Worker] Worker error:", err);
});

process.on("SIGTERM", async () => {
  console.log("[Survey Analytics Worker] Shutting down gracefully...");
  await surveyAnalyticsWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Survey Analytics Worker] Shutting down gracefully...");
  await surveyAnalyticsWorker.close();
  process.exit(0);
});

export default surveyAnalyticsWorker;
