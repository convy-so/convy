import { Worker, Job } from "bullmq";
import { z } from "zod";

import type { ConversationInsightsJobData } from "@/lib/queue";
import { buildSessionInsight } from "@/lib/education/analytics-workflow";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import {
  getSessionBySourceId,
  purgeSessionAnalyticsArtifacts,
} from "@/lib/education/storage";
import { getRedisClient } from "@/lib/redis";

const jobDataSchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  userId: z.string().min(1),
});

const conversationInsightsWorker = new Worker<ConversationInsightsJobData>(
  "conversation-insights",
  async (job: Job<ConversationInsightsJobData>) => {
    const validated = jobDataSchema.parse(job.data);
    const session = await getSessionBySourceId(validated.conversationId);
    if (session?.sessionType === "sample") {
      await purgeSessionAnalyticsArtifacts({
        surveyId: validated.surveyId,
        sessionId: session.id,
      }).catch((error) => {
        console.error("[conversation-insights-worker] failed to purge sample analytics artifacts", {
          surveyId: validated.surveyId,
          conversationId: validated.conversationId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
      await job.updateProgress(100);
      return {
        success: true,
        skipped: "sample_session",
        conversationId: validated.conversationId,
        surveyId: validated.surveyId,
      };
    }

    const insight = session ? await buildSessionInsight(session.id) : null;
    if (session?.sessionType === "live") {
      await scheduleAnalyticsRefresh({
        surveyId: validated.surveyId,
        userId: validated.userId,
      }).catch((error) => {
        console.error("[conversation-insights-worker] failed to schedule analytics refresh", {
          surveyId: validated.surveyId,
          conversationId: validated.conversationId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
    }
    await job.updateProgress(100);
    return {
      success: Boolean(insight),
      conversationId: validated.conversationId,
      surveyId: validated.surveyId,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 2,
  },
);

export default conversationInsightsWorker;

