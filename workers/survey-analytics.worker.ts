import { Worker, Job } from "bullmq";
import { z } from "zod";

import type { SurveyAnalyticsJobData } from "@/lib/queue";
import { buildAnalyticsSnapshot } from "@/lib/education/analytics-workflow";
import {
  markAnalyticsCompleted,
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
    await markAnalyticsRunning(validated.surveyId);
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
        });
      } else {
        await markAnalyticsFailed(
          validated.surveyId,
          new Error("Not enough structured session data to build analytics yet."),
        );
      }
      await job.updateProgress(100);
      return {
        success: Boolean(snapshot),
        surveyId: validated.surveyId,
        version: snapshot?.version ?? null,
      };
    } catch (error) {
      await markAnalyticsFailed(validated.surveyId, error);
      throw error;
    }
  },
  {
    connection: getRedisClient(),
    concurrency: 1,
  },
);

export default surveyAnalyticsWorker;
