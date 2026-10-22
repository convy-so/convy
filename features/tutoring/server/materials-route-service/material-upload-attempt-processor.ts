import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { buildLessonMaterialAccessPath } from "@/features/tutoring/public-server";
import {
  buildMaterialGroundingMap,
  extractLearningMaterialSourceDocument,
} from "@/features/tutoring/server/materials";
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
import { TUTORING_STATUS } from "@/shared/tutoring/constants";
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
  const attempt = await getDb().query.lessonMaterialUploadAttempts.findFirst({
    where: eq(lessonMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === TUTORING_STATUS.uploadSucceeded) {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;
  let currentStage: LearningMaterialUploadAttemptStage =
    TUTORING_STATUS.uploadStageExtraction;

  try {
    const lesson = await getTeacherLessonAccess(data.userId, data.lessonId);
    if (!lesson) {
      throw new Error("Lesson not found or user is no longer authorized.");
    }

    if (!attempt.storagePath) {
      throw new Error("Uploaded file could not be found for processing.");
    }

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: TUTORING_STATUS.uploadProcessing,
      stage: TUTORING_STATUS.uploadStageExtraction,
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
    const buffer = await downloadLessonMaterial(attempt.storagePath);

    const sourceDocument = await extractLearningMaterialSourceDocument({
      materialId,
      buffer,
      filename: data.fileName,
      mimeType: data.mimeType,
      title: data.title,
    });
    const extractedText = sourceDocument.extractedText;

    currentStage = TUTORING_STATUS.uploadStageAnalysis;
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: TUTORING_STATUS.uploadProcessing,
      stage: TUTORING_STATUS.uploadStageAnalysis,
    });

    const groundingMap = await buildMaterialGroundingMap({
      lessonTitle: lesson.title,
      materialId,
      materialTitle: data.title?.trim() || data.fileName,
      sourceDocument,
    });

    const analysis = buildMaterialAnalysisPreview({
      groundingMap,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material analysis failed for this file.");
    }

    currentStage = TUTORING_STATUS.uploadStageIndexing;
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: TUTORING_STATUS.uploadProcessing,
      stage: TUTORING_STATUS.uploadStageIndexing,
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
        extractionStatus: TUTORING_STATUS.materialCompleted,
        extractionError: null,
        indexingStatus: TUTORING_STATUS.materialProcessing,
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

    currentStage = TUTORING_STATUS.uploadStagePackBuild;
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: TUTORING_STATUS.uploadProcessing,
      stage: TUTORING_STATUS.uploadStagePackBuild,
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

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      lessonId: data.lessonId,
      batchId: attempt.batchId,
      status: TUTORING_STATUS.uploadProcessing,
      stage: TUTORING_STATUS.uploadStagePackBuild,
      userMessage: null,
      internalError: null,
      errorCode: null,
      retryable: null,
      failedAt: null,
      completedAt: new Date(),
      failureMessage: null,
      materialId,
    });

    await enqueueLessonMaterialBatchFinalize({
      batchId: attempt.batchId,
      lessonId: data.lessonId,
      classroomId: data.classroomId,
    });

    return { success: true, materialId };
  } catch (error) {
    const failure = buildUploadAttemptFailure(currentStage, error);

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
      status: TUTORING_STATUS.uploadFailed,
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
