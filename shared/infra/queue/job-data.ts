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
  lessonId: string;
  classroomId: string;
  studentUserId: string;
  classroomStudentId: string;
  studentName: string;
  lessonTitle: string;
  courseId?: string | null;
  courseTitle?: string | null;
  sourceLocale?: string | null;
  previousReport?: Record<string, unknown> | null;
}

export interface LessonMaterialProcessingJobData {
  attemptId: string;
  lessonId: string;
  classroomId: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string | null;
  description?: string | null;
}

export interface LessonMaterialBatchFinalizeJobData {
  batchId: string;
  lessonId: string;
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
  var lessonMaterialProcessingQueue:
    | Queue<LessonMaterialProcessingJobData>
    | undefined;
  var lessonMaterialBatchFinalizeQueue:
    | Queue<LessonMaterialBatchFinalizeJobData>
    | undefined;
  var contentTranslationQueue: Queue<ContentTranslationJobData> | undefined;
  var experimentEvaluationQueue: Queue<unknown> | undefined;
  var notificationQueue: Queue<NotificationJobData> | undefined;
}

