import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  conversationInsights,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import {
  getConversationInsightsPrompt,
  getConversationSummaryPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { ConversationInsightsJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const jobDataSchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Worker for generating conversation insights
 * Processes AI-powered analysis of completed survey conversations
 */
const conversationInsightsWorker = new Worker<ConversationInsightsJobData>(
  "conversation-insights",
  async (job: Job<ConversationInsightsJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { conversationId, surveyId } = validatedData;

    console.log(
      `[Conversation Insights Worker] Processing job ${job.id} for conversation ${conversationId}`
    );

    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    const surveyConfig: SurveyConfig = buildCompleteSurveyConfig(survey);

    await job.updateProgress(25);

    const summaryPrompt = getConversationSummaryPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const summary = await generateAIResponse(summaryPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1000,
    });

    await job.updateProgress(50);

    const insightsPrompt = getConversationInsightsPrompt(
      conversation.rawConversation,
      surveyConfig
    );
    const insightsText = await generateAIResponse(insightsPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 1500,
    });

    await job.updateProgress(75);

    let insights: Record<string, unknown>;
    let keyFindings: string;

    try {
      const jsonMatch = insightsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
        keyFindings = insightsText.replace(jsonMatch[0], "").trim();
      } else {
        insights = { raw: insightsText };
        keyFindings = insightsText;
      }
    } catch {
      insights = { raw: insightsText };
      keyFindings = insightsText;
    }

    await db
      .update(surveyConversations)
      .set({ summary })
      .where(eq(surveyConversations.id, conversationId));

    const [existingInsight] = await db
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, conversationId));

    if (existingInsight) {
      await db
        .update(conversationInsights)
        .set({
          insights,
          keyFindings,
        })
        .where(eq(conversationInsights.conversationId, conversationId));
    } else {
      await db.insert(conversationInsights).values({
        id: crypto.randomUUID(),
        conversationId,
        insights,
        keyFindings,
      });
    }

    await job.updateProgress(100);

    console.log(
      `[Conversation Insights Worker] Completed job ${job.id} for conversation ${conversationId}`
    );

    // After insights are generated, use the analytics scheduler to handle
    // the two-stage approach (accumulation + debouncing)
    try {
      const { scheduleAnalyticsOnNewResponse } = await import(
        "@/lib/analytics-scheduler"
      );
      await scheduleAnalyticsOnNewResponse(surveyId, job.data.userId);
    } catch (error) {
      console.error(
        `[Conversation Insights Worker] Failed to schedule analytics:`,
        error
      );
      // Don't fail the insights job if analytics scheduling fails
    }

    return {
      conversationId,
      summary,
      insights,
      keyFindings,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

conversationInsightsWorker.on("completed", (job) => {
  console.log(`[Conversation Insights Worker] Job ${job.id} completed`);
});

conversationInsightsWorker.on("failed", (job, err) => {
  console.error(
    `[Conversation Insights Worker] Job ${job?.id} failed:`,
    err.message
  );
});

conversationInsightsWorker.on("error", (err) => {
  console.error("[Conversation Insights Worker] Worker error:", err);
});

process.on("SIGTERM", async () => {
  console.log("[Conversation Insights Worker] Shutting down gracefully...");
  await conversationInsightsWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Conversation Insights Worker] Shutting down gracefully...");
  await conversationInsightsWorker.close();
  process.exit(0);
});

export default conversationInsightsWorker;

