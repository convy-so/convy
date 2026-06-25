import type { Queue } from "bullmq";

export interface SurveyAnalyticsJobData {
  surveyId: string;
  userId: string;
  reason?: string;
  score?: number;
}

export interface EmailJobData {
  type:
    | "verification"
    | "password-reset"
    | "expert-invitation-verification"
    | "expert-password-setup"
    | "secondary-verification"
    | "survey-deleted"
    | "student-invitation";
  email: string;
  url: string;
  name?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ImageUploadJobData {
  surveyId: string;
  imageId: string;
  buffer: Buffer;
  contentType: string;
  userId: string;
}

export interface TutoringReportJobData {
  sessionId: string;
  topicId: string;
  classroomId: string;
  studentUserId: string;
  classroomStudentId: string;
  studentName: string;
  topicTitle: string;
  courseId?: string | null;
  courseTitle?: string | null;
  sourceLocale?: string | null;
  previousReport?: Record<string, unknown> | null;
}

export interface LearningMaterialProcessingJobData {
  attemptId: string;
  topicId: string;
  classroomId: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string | null;
  description?: string | null;
}

export interface LearningMaterialBatchFinalizeJobData {
  batchId: string;
  topicId: string;
  classroomId: string;
}

export interface ContentTranslationJobData {
  resourceType: string;
  resourceId: string;
  field: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  context?: string;
}

export interface NotificationJobData {
  type: "email" | "in_app";
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

declare global {
  var surveyAnalyticsQueue: Queue<SurveyAnalyticsJobData> | undefined;
  var emailQueue: Queue<EmailJobData> | undefined;
  var imageUploadQueue: Queue<ImageUploadJobData> | undefined;
  var tutoringReportQueue: Queue<TutoringReportJobData> | undefined;
  var learningMaterialProcessingQueue:
    | Queue<LearningMaterialProcessingJobData>
    | undefined;
  var learningMaterialBatchFinalizeQueue:
    | Queue<LearningMaterialBatchFinalizeJobData>
    | undefined;
  var contentTranslationQueue: Queue<ContentTranslationJobData> | undefined;
  var experimentEvaluationQueue: Queue<unknown> | undefined;
  var notificationQueue: Queue<NotificationJobData> | undefined;
}
