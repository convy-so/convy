import { Job, Worker } from "bullmq";
import { getRedisClient } from "@/lib/redis";
import { notificationQueue } from "@/lib/queue";
import { logger } from "@/lib/logger";

const connection = getRedisClient();

export const notificationWorker = new Worker(
  "notifications",
  async (job: Job<{ type: "slack" | "email" | "in_app"; userId: string; message: string; metadata?: Record<string, unknown> }>) => {
     const { type, userId, message, metadata } = job.data;
     
     logger.info(`Processing ${type} notification`, { id: job.id, userId });

     try {
       if (type === "slack") {
         const { event, surveyId, conversationId } = metadata || {};
         
         // Dynamically import to ensure clean separation
         const slackActions = await import("@/app/actions/slack");
         
         if (event === "survey_created" && surveyId && typeof surveyId === "string") {
            await slackActions.autoPostSurveyCreated(userId, surveyId);
         } else if (event === "new_conversation" && surveyId && conversationId && typeof surveyId === "string" && typeof conversationId === "string") {
            await slackActions.autoPostNewConversation(userId, surveyId, conversationId);
         } else if (event === "analytics_updated" && surveyId && typeof surveyId === "string") {
            await slackActions.autoPostAnalyticsUpdate(userId, surveyId);
         }
       } else if (type === "email") {
         // e.g. await sendEmail(...)
       }
       
       await new Promise(resolve => setTimeout(resolve, 200)); 
       return { sent: true };
     } catch (error) {
       logger.error("Notification failed", { id: job.id, error });
       throw error;
     }
  },
  {
    connection,
    concurrency: 5
  }
);

notificationWorker.on("completed", (job) => {
  logger.debug("Notification job completed", { id: job.id });
});

notificationWorker.on("failed", (job, err) => {
  logger.warn("Notification job failed", { id: job?.id, error: err.message });
});
