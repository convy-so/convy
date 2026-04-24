import { MetricsTime, Worker, Job } from "bullmq";
import { z } from "zod";

import type { SurveyAnalyticsJobData } from "@/lib/queue";
import { buildAnalyticsSnapshot } from "@/lib/education/analytics-workflow";
import {
  markAnalyticsCompleted,
  markAnalyticsDeferred,
  markAnalyticsFailed,
  markAnalyticsRunning,
} from "@/lib/analytics-scheduler";
import { getRedisClient } from "@/lib/redis";

const jobDataSchema = z.object({
  surveyId: z.string().min(1),
  userId: z.string().min(1),
  reason: z.string().optional(),
  score: z.number().optional(),
});

const surveyAnalyticsWorker = new Worker<SurveyAnalyticsJobData>(
  "survey-analytics",
  async (job: Job<SurveyAnalyticsJobData>) => {
    const validated = jobDataSchema.parse(job.data);
    await markAnalyticsRunning({
      surveyId: validated.surveyId,
      jobId: job.id,
    });
    try {
      const snapshot = await buildAnalyticsSnapshot(validated.surveyId, {
        triggeredBy: validated.reason === "manual_refresh" ? "manual" : "automatic",
        triggerReason: validated.reason ?? "automatic_refresh",
        materialityScore: validated.score ?? 0,
      });
      if (snapshot) {
        await markAnalyticsCompleted({
          surveyId: validated.surveyId,
          version: snapshot.version,
          reason: snapshot.generation?.triggerReason ?? validated.reason ?? "automatic_refresh",
          score: snapshot.generation?.materialityScore ?? validated.score ?? 0,
          jobId: job.id,
        });
      } else {
        await markAnalyticsDeferred({
          surveyId: validated.surveyId,
          reason: validated.reason ?? "insufficient_grounded_data",
          score: validated.score ?? 0,
          jobId: job.id,
        });
      }
      await job.updateProgress(100);
      return {
        success: Boolean(snapshot),
        surveyId: validated.surveyId,
        version: snapshot?.version ?? null,
      };
    } catch (error) {
      await markAnalyticsFailed({
        surveyId: validated.surveyId,
        error,
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: getRedisClient(),
    concurrency: 1,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2,
    },
  },
);

surveyAnalyticsWorker.on("failed", (job, err) => {
  console.error("[survey-analytics-worker] job failed", {
    jobId: job?.id,
    surveyId: job?.data?.surveyId,
    message: err instanceof Error ? err.message : String(err),
  });
});

export default surveyAnalyticsWorker;
