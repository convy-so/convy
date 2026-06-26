import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import {
  buildMaterialGroundingMap,
  extractLearningMaterialSourceDocument,
} from "@/features/tutoring/server/materials";
import { buildLessonMaterialAccessPath } from "@/features/surveys/public-server";
import { getDb } from "@/shared/db";
import {
  lessonMaterialUploadAttempts,
  lessonMaterials,
} from "@/shared/db/schema";
import {
  enqueueLessonMaterialBatchFinalize,
  type LessonMaterialProcessingJobData,
} from "@/shared/infra/queue";
import { downloadLessonMaterial } from "@/shared/infra/supabase-storage";
import { LEARNING_STATUS } from "@/shared/learning/constants";
import { requireValue } from "@/shared/utils/collections";

import { indexMaterialAndSyncBoundary } from "./material-indexing";
import {
  buildMaterialAnalysisPreview,
  deleteMaterialProcessingArtifacts,
} from "./material-processing-artifacts";
import {
  buildUploadAttemptFailure,
  inferMaterialKind,
  isMaterialAnalysisFailed,
  type LearningMaterialUploadAttemptStage,
} from "./material-upload-attempt-state";
import { updateLearningMaterialUploadAttempt } from "./material-upload-attempt-store";

export async function processLearningMaterialUploadAttempt(
  data: LessonMaterialProcessingJobData,
) {
  const startedAt = Date.now();
  const attempt = await getDb().query.lessonMaterialUploadAttempts.findFirst({
    where: eq(lessonMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === LEARNING_STATUS.uploadSucceeded) {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;
  let currentStage: LearningMaterialUploadAttemptStage =
    LEARNING_STATUS.uploadStageExtraction;

  try {
    console.info("[lesson-material-worker] processing start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      classroomId: data.classroomId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    });

    console.info("[lesson-material-worker] lesson access check start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      userId: data.userId,
    });
    const lesson = await getTeacherLessonAccess(data.userId, data.lessonId);
    if (!lesson) {
      throw new Error("Lesson not found or user is no longer authorized.");
    }
    console.info("[lesson-material-worker] lesson access check complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      classroomId: lesson.classroomId,
    });

    if (!attempt.storagePath) {
      throw new Error("Uploaded file could not be found for processing.");
    }

    console.info("[lesson-material-worker] marking extraction started", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      storagePath: attempt.storagePath,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageExtraction,
      userMessage: null,
      internalError: null,
      errorCode: null,
      retryable: null,
      failedAt: null,
      completedAt: null,
      processingStartedAt: attempt.processingStartedAt ?? new Date(),
      failureMessage: null,
      materialId: null,
    });

    materialId = nanoid();
    console.info("[lesson-material-worker] download start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      storagePath: attempt.storagePath,
      materialId,
    });
    const buffer = await downloadLessonMaterial(attempt.storagePath);
    console.info("[lesson-material-worker] download complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      storagePath: attempt.storagePath,
      materialId,
      sizeBytes: buffer.byteLength,
    });

    console.info("[lesson-material-worker] extraction start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
      mimeType: data.mimeType,
    });
    const sourceDocument = await extractLearningMaterialSourceDocument({
      materialId,
      buffer,
      filename: data.fileName,
      mimeType: data.mimeType,
      title: data.title,
      traceId: data.attemptId,
      lessonId: data.lessonId,
    });
    const extractedText = sourceDocument.extractedText;

    console.info("[lesson-material-worker] extraction complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      extractedTextLength: extractedText.length,
      segmentCount: sourceDocument.segments.length,
    });

    currentStage = LEARNING_STATUS.uploadStageAnalysis;
    console.info("[lesson-material-worker] marking analysis started", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageAnalysis,
    });

    console.info("[lesson-material-worker] grounding map start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
      segmentCount: sourceDocument.segments.length,
    });
    const groundingMap = await buildMaterialGroundingMap({
      lessonTitle: lesson.title,
      materialId,
      materialTitle: data.title?.trim() || data.fileName,
      sourceDocument,
      traceId: data.attemptId,
      lessonId: data.lessonId,
    });

    const analysis = buildMaterialAnalysisPreview({
      groundingMap,
    });

    console.info("[lesson-material-worker] analysis complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      analysisKeys: Object.keys(analysis).join(","),
      summaryLength: typeof analysis.summary === "string" ? analysis.summary.length : 0,
      clarifyingQuestionCount: Array.isArray(analysis.clarifyingQuestions)
        ? analysis.clarifyingQuestions.length
        : 0,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material analysis failed for this file.");
    }

    currentStage = LEARNING_STATUS.uploadStageIndexing;
    console.info("[lesson-material-worker] marking indexing started", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageIndexing,
    });

    console.info("[lesson-material-worker] material insert start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });
    const [material] = await getDb()
      .insert(lessonMaterials)
      .values({
        id: materialId,
        lessonId: data.lessonId,
        uploadedByUserId: data.userId,
        title: data.title?.trim() || data.fileName,
        description: data.description?.trim() || null,
        materialKind: inferMaterialKind(data.mimeType),
        storageBucket: attempt.storageBucket,
        storagePath: data.storagePath,
        publicUrl: buildLessonMaterialAccessPath(materialId),
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        extractionStatus: LEARNING_STATUS.materialCompleted,
        extractionError: null,
        indexingStatus: LEARNING_STATUS.materialProcessing,
        indexingError: null,
        extractedText,
        sourceDocument,
        groundingMap,
        coverageAnalysis: analysis,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const persistedMaterial = requireValue(
      material,
      `Failed to create lesson material ${materialId} for upload attempt ${data.attemptId}`,
    );
    console.info("[lesson-material-worker] material insert complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });

    currentStage = LEARNING_STATUS.uploadStagePackBuild;
    console.info("[lesson-material-worker] marking pack build started", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStagePackBuild,
      materialId,
    });

    console.info("[lesson-material-worker] indexing and boundary sync start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });
    await indexMaterialAndSyncBoundary({
      lessonId: data.lessonId,
      materialId,
      material: persistedMaterial,
      mimeType: data.mimeType,
      extractedText,
      analysis,
      sourceDocument,
      groundingMap,
      lesson,
    });
    console.info("[lesson-material-worker] indexing and boundary sync complete", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStagePackBuild,
      userMessage: null,
      internalError: null,
      errorCode: null,
      retryable: null,
      failedAt: null,
      completedAt: new Date(),
      failureMessage: null,
      materialId,
    });

    console.info("[lesson-material-worker] batch finalizer enqueue start", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      materialId,
    });
    const finalizeJob = await enqueueLessonMaterialBatchFinalize({
      batchId: attempt.batchId,
      lessonId: data.lessonId,
      classroomId: data.classroomId,
    });
    console.info("[lesson-material-worker] batch finalizer enqueued", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      materialId,
      jobId: finalizeJob?.id ?? null,
    });

    console.info("[lesson-material-worker] processing succeeded", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      materialId,
      durationMs: Date.now() - startedAt,
    });

    return { success: true, materialId };
  } catch (error) {
    const failure = buildUploadAttemptFailure(currentStage, error);

    console.error("[lesson-material-worker] processing failed", {
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      stage: currentStage,
      durationMs: Date.now() - startedAt,
      error: failure.internalError,
      retryable: failure.retryable,
    });

    await deleteMaterialProcessingArtifacts({
      materialId,
      storagePath: attempt.storagePath ?? data.storagePath,
      deleteSourceFile: false,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadFailed,
      stage: currentStage,
      userMessage: failure.userMessage,
      internalError: failure.internalError,
      errorCode: failure.errorCode,
      retryable: failure.retryable,
      failedAt: failure.failedAt,
      completedAt: null,
      failureMessage: failure.failureMessage,
      materialId: null,
    });

    return {
      success: false,
      error: failure.internalError,
      userMessage: failure.userMessage,
      retryable: failure.retryable,
    };
  }
}

