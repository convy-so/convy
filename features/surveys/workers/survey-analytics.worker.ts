import { MetricsTime, Worker, Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { SurveyAnalyticsJobData } from "@/shared/infra/queue";
import { buildAnalyticsSnapshot } from "@/features/surveys/server/education/analytics-workflow";
import {
  markAnalyticsCompleted,
  markAnalyticsDeferred,
  markAnalyticsFailed,
  markAnalyticsRunning,
} from "@/features/surveys/server/analytics/analytics-refresh-scheduler";
import { getRedisClient } from "@/shared/infra/redis";

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
  Sentry.logger.error("Survey analytics worker job failed", {
    service: "survey-analytics-worker",
    job_id: job?.id ?? "",
    survey_id: job?.data?.surveyId ?? "",
    error_message: err instanceof Error ? err.message : String(err),
  });
});

export default surveyAnalyticsWorker;
