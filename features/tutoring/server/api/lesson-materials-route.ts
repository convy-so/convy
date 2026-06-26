import { and, eq, ne } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { lessonMaterials } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";
import { uploadLessonMaterial } from "@/shared/infra/supabase-storage";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";
import {
  buildUploadAttemptFailure,
  createLearningMaterialUploadAttempt,
  getTeacherLessonOrNull,
  isMaterialAnalysisFailed,
  type LearningMaterialUploadAttemptStage,
  normalizeDetectedLearningMaterialMime,
  updateLearningMaterialUploadAttempt,
} from "@/features/tutoring/server/materials-route-service";
import { assertLessonMaterialFile } from "@/shared/security/uploads";
import { enqueueLessonMaterialProcessing } from "@/shared/infra/queue";
import { publishClassroomRealtimeEvent } from "@/shared/infra/realtime";
import { serializeUploadAttempt } from "@/features/tutoring/server/api/lesson-material-upload-response";

function getOptionalFormDataText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getFileMetadata(formData: FormData, key: string, index: number) {
  return (
    getOptionalFormDataText(formData, `${key}-${index}`) ||
    getOptionalFormDataText(formData, `${key}:${index}`) ||
    getOptionalFormDataText(formData, key)
  );
}

type LearningMaterialUploadFailurePoint =
  | "attempt_create"
  | "input_validation"
  | "buffer_read"
  | "mime_detection"
  | "storage_upload"
  | "attempt_storage_update"
  | "queue_enqueue"
  | "attempt_queue_update";

function annotateLearningMaterialUploadError(
  failurePoint: LearningMaterialUploadFailurePoint,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${failurePoint}: ${message}`);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const lesson = await getTeacherLessonOrNull(session.user.id, lessonId);
    if (!lesson) return apiError("UNAUTHORIZED", "Unauthorized");

    const materials = await getDb().query.lessonMaterials.findMany({
      where: and(
        eq(lessonMaterials.lessonId, lessonId),
        ne(lessonMaterials.extractionStatus, TUTORING_STATUS.materialFailed),
        ne(lessonMaterials.indexingStatus, TUTORING_STATUS.materialFailed),
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: materials
        .filter((material) => !isMaterialAnalysisFailed(material.analysis))
        .map((material) => ({
          ...material,
          analysis: material.analysis ?? undefined,
        })),
    });
  } catch (error) {
    return handleTutoringRouteError(error, "Failed to load materials", "/api/lessons/[lessonId]/materials");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const startedAt = Date.now();
  let lessonIdForLog = "unknown";

  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    lessonIdForLog = lessonId;
    console.info("[lesson-material-upload] start", {
      lessonId,
      userId: session.user.id,
    });

    const lesson = await getTeacherLessonOrNull(session.user.id, lessonId);
    if (!lesson) return apiError("UNAUTHORIZED", "Unauthorized");

    const formData = await request.formData();
    const files = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((value): value is File => value instanceof File && value.size > 0);

    if (!files.length) return apiError("VALIDATION_ERROR", "File is required");

    const batchId = nanoid();
    const attempts = [];

    for (const [index, file] of files.entries()) {
      const attemptId = nanoid();
      const title = getFileMetadata(formData, "title", index);
      const description = getFileMetadata(formData, "description", index);
      let uploadedBucket: string | null = null;
      let uploadedPath: string | null = null;
      let mimeType: string | null = file.type || null;
      let failurePoint: LearningMaterialUploadFailurePoint = "attempt_create";
      let failureStage: LearningMaterialUploadAttemptStage =
        TUTORING_STATUS.uploadStageUpload;
      console.info("[lesson-material-upload] attempt create start", {
        lessonId,
        batchId,
        attemptId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      let attempt = await createLearningMaterialUploadAttempt({
        id: attemptId,
        batchId,
        lessonId,
        uploadedByUserId: session.user.id,
        fileName: file.name,
        title,
        description,
        mimeType,
        sizeBytes: file.size,
        status: TUTORING_STATUS.uploadProcessing,
        stage: TUTORING_STATUS.uploadStageUpload,
        processingStartedAt: new Date(),
      });
      console.info("[lesson-material-upload] attempt create complete", {
        lessonId,
        batchId,
        attemptId,
        status: attempt?.status ?? null,
        stage: attempt?.stage ?? null,
      });

      try {
        console.info("[lesson-material-upload] file received", {
          lessonId,
          batchId,
          attemptId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        failurePoint = "input_validation";
        assertLessonMaterialFile(file);

        failurePoint = "buffer_read";
        const buffer = Buffer.from(await file.arrayBuffer());

        failurePoint = "mime_detection";
        const detected = await fileTypeFromBuffer(buffer);
        mimeType = normalizeDetectedLearningMaterialMime({
          filename: file.name,
          fileType: file.type,
          detectedMime: detected?.mime,
        });
        assertLessonMaterialFile({ name: file.name, size: file.size, type: mimeType });
        console.info("[lesson-material-upload] file validated", {
          lessonId,
          batchId,
          attemptId,
          fileName: file.name,
          browserMimeType: file.type,
          detectedMimeType: detected?.mime ?? null,
          normalizedMimeType: mimeType,
          sizeBytes: file.size,
        });

        failurePoint = "storage_upload";
        const uploaded = await uploadLessonMaterial(
          buffer,
          lessonId,
          attemptId,
          mimeType,
          file.name,
        );
        uploadedBucket = uploaded.bucket;
        uploadedPath = uploaded.path;
        console.info("[lesson-material-upload] storage upload complete", {
          lessonId,
          batchId,
          attemptId,
          bucket: uploaded.bucket,
          path: uploaded.path,
        });

        failurePoint = "attempt_storage_update";
        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: lesson.classroomId,
            lessonId,
            batchId,
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploaded.bucket,
            storagePath: uploaded.path,
            userMessage: null,
            internalError: null,
            errorCode: null,
            retryable: null,
            failedAt: null,
            completedAt: null,
            failureMessage: null,
          })) ?? attempt;

        failureStage = TUTORING_STATUS.uploadStageExtraction;
        failurePoint = "queue_enqueue";
        const processingJob = await enqueueLessonMaterialProcessing({
          attemptId,
          lessonId,
          classroomId: lesson.classroomId,
          userId: session.user.id,
          storagePath: uploaded.path,
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          title: title || null,
          description: description || null,
        });
        console.info("[lesson-material-upload] processing job enqueued", {
          lessonId,
          batchId,
          attemptId,
          jobId: processingJob?.id ?? null,
          queueName: processingJob?.queueName ?? "lesson-material-processing",
        });

        failurePoint = "attempt_queue_update";
        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: lesson.classroomId,
            lessonId,
            batchId,
            status: TUTORING_STATUS.uploadQueued,
            stage: TUTORING_STATUS.uploadStageExtraction,
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploaded.bucket,
            storagePath: uploaded.path,
            queuedAt: new Date(),
            userMessage: null,
            internalError: null,
            errorCode: null,
            retryable: null,
            failedAt: null,
            completedAt: null,
            failureMessage: null,
          })) ?? attempt;

        attempts.push(attempt);
      } catch (error) {
        const annotatedError = annotateLearningMaterialUploadError(
          failurePoint,
          error,
        );
        const failure = buildUploadAttemptFailure(failureStage, annotatedError);
        console.error("[lesson-material-upload] file failed", {
          lessonId,
          batchId,
          attemptId,
          fileName: file.name,
          failureStage,
          failurePoint,
          uploadedBucket,
          uploadedPath,
          error: annotatedError,
        });
        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: lesson.classroomId,
            lessonId,
            batchId,
            status: TUTORING_STATUS.uploadFailed,
            stage: failureStage,
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploadedBucket,
            storagePath: uploadedPath,
            userMessage: failure.userMessage,
            internalError: failure.internalError,
            errorCode: failure.errorCode,
            retryable: failure.retryable,
            failedAt: failure.failedAt,
            completedAt: null,
            failureMessage: failure.failureMessage,
          })) ?? attempt;
        if (attempt) attempts.push(attempt);
      }
    }

    await publishClassroomRealtimeEvent(lesson.classroomId, {
      type: "lesson_material_upload_updated",
      lessonId,
      batchId,
      attemptIds: attempts.map((attempt) => attempt.id),
    });

    console.info("[lesson-material-upload] batch queued", {
      lessonId,
      batchId,
      attemptCount: attempts.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      data: {
        batchId,
        attempts: attempts.map(serializeUploadAttempt),
      },
    });
  } catch (error) {
    console.error("[lesson-material-upload] failed", {
      lessonId: lessonIdForLog,
      durationMs: Date.now() - startedAt,
      error,
    });

    return handleTutoringRouteError(error, "Failed to upload material", "/api/lessons/[lessonId]/materials");
  }
}


