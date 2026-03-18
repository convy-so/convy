/**
 * Survey Creation Extraction Worker
 *
 * Processes extraction jobs from the `survey-creation-extraction` BullMQ queue.
 * Runs the Gemini extraction call in the background so it never blocks the
 * main conversation stream, and is rate-limited to 5 calls/minute.
 *
 * Job deduplication (same jobId per surveyId + 5s delay) means rapid
 * consecutive turns collapse into a single extraction rather than N calls.
 */

import { Worker, Job } from "bullmq";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyCreationConversations } from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import { analysisModel } from "@/lib/ai";
import { withRetry } from "@/lib/ai-retry";
import { generateText, Output } from "ai";
import { z as zod } from "zod";
import { getSurveyDataExtractionPrompt } from "@/lib/prompts";
import { logUsage } from "@/lib/billing/logger";
import type { SurveyCreationExtractionJobData } from "@/lib/queue";

const jobDataSchema = z.object({
  surveyId: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

const surveyCreationExtractionWorker =
  new Worker<SurveyCreationExtractionJobData>(
    "survey-creation-extraction",
    async (job: Job<SurveyCreationExtractionJobData>) => {
      const { surveyId, messages } = jobDataSchema.parse(job.data);

      if (messages.length < 2) {
        return { skipped: true, reason: "insufficient_messages" };
      }

      await job.updateProgress(10);

      const extractionPrompt = getSurveyDataExtractionPrompt(messages);

      const { output: parsed, usage } = await withRetry(() =>
        generateText({
          model: analysisModel,
          output: Output.object({
            schema: zod.object({
              objective: zod.any().nullable(),
              targetAudience: zod.any().nullable(),
              scope: zod.any().nullable(),
              successCriteria: zod.any().nullable(),
              constraints: zod.any().nullable(),
              hypotheses: zod.any().nullable(),
              tone: zod.any().nullable(),
              requiredQuestions: zod.any().nullable(),
              metrics: zod.any().nullable(),
              personalInfo: zod.any().nullable(),
              domainId: zod.any().nullable(),
              isVoice: zod.boolean().nullable(),
              media: zod
                .array(
                  zod.object({
                    id: zod.string(),
                    url: zod.string(),
                    type: zod.enum(["image", "audio", "video"]),
                    description: zod.string(),
                    contextForUse: zod.string(),
                  }),
                )
                .nullable(),
              title: zod.any().nullable(),
              collectedInfo: zod.any(),
            }) as any,
          }),
          prompt: extractionPrompt,
        }),
      );

      await job.updateProgress(70);

      logUsage({
        surveyId,
        type: "llm_text",
        provider: "google",
        modelName: (analysisModel as any).modelId,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });

      const { collectedInfo, ...extractedData } = parsed as any;

      await getDb()
        .update(surveyCreationConversations)
        .set({ extractedData, collectedInfo })
        .where(eq(surveyCreationConversations.surveyId, surveyId));

      // Publish event to notify active voice handlers for real-time state sync
      const redis = getRedisClient();
      await redis.publish(
        `survey:creation:events:${surveyId}`,
        JSON.stringify({
          type: "state_updated",
          collectedInfo,
          extractedData,
        }),
      );

      await job.updateProgress(100);

      return { success: true };
    },
    {
      connection: getRedisClient(),
      concurrency: 3,
      // At most 5 extraction calls per minute across all worker instances
      limiter: { max: 5, duration: 60_000 },
    },
  );

surveyCreationExtractionWorker.on("completed", (job) => {});
surveyCreationExtractionWorker.on("failed", (job, err) =>
  console.error(
    `[CreationExtractionWorker] Job ${job?.id} failed:`,
    err.message,
  ),
);
surveyCreationExtractionWorker.on("error", (err) =>
  console.error("[CreationExtractionWorker] Worker error:", err),
);

export default surveyCreationExtractionWorker;
