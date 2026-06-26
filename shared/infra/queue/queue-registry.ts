import { Queue, type QueueOptions } from "bullmq";

import { getRedisClient } from "@/shared/infra/redis";
import type {
  ContentTranslationJobData,
  EmailJobData,
  ImageUploadJobData,
  LessonMaterialBatchFinalizeJobData,
  LessonMaterialProcessingJobData,
  NotificationJobData,
  SurveyAnalyticsJobData,
  TutoringReportJobData,
} from "@/shared/infra/queue/job-data";

function createQueue<T>(
  name: string,
  options: Partial<QueueOptions> = {},
): Queue<T> {
  return new Queue(name, {
    connection: getRedisClient(),
    ...options,
  });
}

export const getSurveyAnalyticsQueue = () => {
  if (!global.surveyAnalyticsQueue) {
    global.surveyAnalyticsQueue = createQueue<SurveyAnalyticsJobData>(
      "survey-analytics",
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    );
  }

  return global.surveyAnalyticsQueue;
};

export const getEmailQueue = () => {
  if (!global.emailQueue) {
    global.emailQueue = createQueue<EmailJobData>("email", {
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  return global.emailQueue;
};

export const getImageUploadQueue = () => {
  if (!global.imageUploadQueue) {
    global.imageUploadQueue = createQueue<ImageUploadJobData>("image-upload", {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  return global.imageUploadQueue;
};

export const getTutoringReportQueue = () => {
  if (!global.tutoringReportQueue) {
    global.tutoringReportQueue =
      createQueue<TutoringReportJobData>("tutoring-report", {
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
  }

  return global.tutoringReportQueue;
};

export const getLessonMaterialProcessingQueue = () => {
  if (!global.lessonMaterialProcessingQueue) {
    global.lessonMaterialProcessingQueue =
      createQueue<LessonMaterialProcessingJobData>(
        "lesson-material-processing",
        {
          defaultJobOptions: {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        },
      );
  }

  return global.lessonMaterialProcessingQueue;
};

export const getLessonMaterialBatchFinalizeQueue = () => {
  if (!global.lessonMaterialBatchFinalizeQueue) {
    global.lessonMaterialBatchFinalizeQueue =
      createQueue<LessonMaterialBatchFinalizeJobData>(
        "lesson-material-batch-finalize",
        {
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        },
      );
  }

  return global.lessonMaterialBatchFinalizeQueue;
};

export const getContentTranslationQueue = () => {
  if (!global.contentTranslationQueue) {
    global.contentTranslationQueue =
      createQueue<ContentTranslationJobData>("content-translation", {
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
  }

  return global.contentTranslationQueue;
};

export const getExperimentEvaluationQueue = () => {
  if (!global.experimentEvaluationQueue) {
    global.experimentEvaluationQueue = createQueue("experiment-evaluation", {
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
      },
    });
  }

  return global.experimentEvaluationQueue;
};

export const getNotificationQueue = () => {
  if (!global.notificationQueue) {
    global.notificationQueue = createQueue<NotificationJobData>("notifications", {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }

  return global.notificationQueue;
};

export function listOpenQueues() {
  return [
    global.surveyAnalyticsQueue,
    global.emailQueue,
    global.imageUploadQueue,
    global.tutoringReportQueue,
    global.lessonMaterialProcessingQueue,
    global.lessonMaterialBatchFinalizeQueue,
    global.contentTranslationQueue,
    global.experimentEvaluationQueue,
    global.notificationQueue,
  ].filter((queue): queue is Queue<unknown> => Boolean(queue));
}

export function clearQueueRegistry() {
  global.surveyAnalyticsQueue = undefined;
  global.emailQueue = undefined;
  global.imageUploadQueue = undefined;
  global.tutoringReportQueue = undefined;
  global.lessonMaterialProcessingQueue = undefined;
  global.lessonMaterialBatchFinalizeQueue = undefined;
  global.contentTranslationQueue = undefined;
  global.experimentEvaluationQueue = undefined;
  global.notificationQueue = undefined;
}
