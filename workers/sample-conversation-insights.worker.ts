import { Worker, Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import {
  getSampleConversationInsightsPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { SampleConversationInsightsJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const jobDataSchema = z.object({
  surveyId: z.string().min(1),
  conversationNumber: z.number().int().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1),
    })
  ),
  userId: z.string().min(1),
});

export interface SampleConversationInsights {
  summary: string;
  keyFindings: string[];
  coveredTopics: string[];
  missedTopics: string[];
  suggestedImprovements: string[];
  toneAssessment?: string;
}

/**
 * Worker for generating sample conversation insights
 * Analyzes sample conversations created by survey makers
 */
const sampleConversationInsightsWorker =
  new Worker<SampleConversationInsightsJobData>(
    "sample-conversation-insights",
    async (job: Job<SampleConversationInsightsJobData>) => {
      const validatedData = jobDataSchema.parse(job.data);
      const { surveyId, conversationNumber, messages } = validatedData;

      console.log(
        `[Sample Conversation Insights Worker] Processing job ${job.id} for survey ${surveyId}, conversation ${conversationNumber}`
      );

      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId));

      if (!survey) {
        throw new Error(`Survey ${surveyId} not found`);
      }

      await job.updateProgress(25);

      const surveyConfig: SurveyConfig = buildCompleteSurveyConfig(survey);

      const insightsPrompt = getSampleConversationInsightsPrompt(
        messages,
        surveyConfig
      );

      const insightsText = await generateAIResponse(insightsPrompt, undefined, {
        model: analysisModel,
        temperature: 0.5,
        maxTokens: 1500,
      });

      await job.updateProgress(70);

      let insights: SampleConversationInsights;

      try {
        const jsonMatch = insightsText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          insights = {
            summary: parsed.summary || "",
            keyFindings: parsed.keyFindings || [],
            coveredTopics: parsed.coveredTopics || [],
            missedTopics: parsed.missedTopics || [],
            suggestedImprovements: parsed.suggestedImprovements || [],
            toneAssessment: parsed.toneAssessment,
          };
        } else {
          insights = {
            summary: insightsText.substring(0, 500),
            keyFindings: [],
            coveredTopics: [],
            missedTopics: [],
            suggestedImprovements: [],
          };
        }
      } catch {
        insights = {
          summary: insightsText.substring(0, 500),
          keyFindings: [],
          coveredTopics: [],
          missedTopics: [],
          suggestedImprovements: [],
        };
      }

      await job.updateProgress(90);

      await db
        .update(sampleConversations)
        .set({ insights })
        .where(
          and(
            eq(sampleConversations.surveyId, surveyId),
            eq(sampleConversations.conversationNumber, conversationNumber)
          )
        );

      await job.updateProgress(100);

      console.log(
        `[Sample Conversation Insights Worker] Completed job ${job.id} for survey ${surveyId}, conversation ${conversationNumber}`
      );

      return {
        surveyId,
        conversationNumber,
        insights,
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

sampleConversationInsightsWorker.on("completed", (job) => {
  console.log(`[Sample Conversation Insights Worker] Job ${job.id} completed`);
});

sampleConversationInsightsWorker.on("failed", (job, err) => {
  console.error(
    `[Sample Conversation Insights Worker] Job ${job?.id} failed:`,
    err.message
  );
});

sampleConversationInsightsWorker.on("error", (err) => {
  console.error("[Sample Conversation Insights Worker] Worker error:", err);
});

// Note: Signal handlers are managed by the main index.ts when running all workers together
// Individual signal handlers removed to prevent conflicts

export default sampleConversationInsightsWorker;
