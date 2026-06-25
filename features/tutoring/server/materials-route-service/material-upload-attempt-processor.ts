import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getTeacherTopicAccess } from "@/features/tutoring/server/access";
import {
  buildMaterialGroundingMap,
  extractLearningMaterialSourceDocument,
} from "@/features/tutoring/server/materials";
import { buildLearningMaterialAccessPath } from "@/features/surveys/public-server";
import { getDb } from "@/shared/db";
import {
  topicMaterialUploadAttempts,
  topicMaterials,
} from "@/shared/db/schema";
import {
  enqueueLearningMaterialBatchFinalize,
  type LearningMaterialProcessingJobData,
} from "@/shared/infra/queue";
import { downloadLearningMaterial } from "@/shared/infra/supabase-storage";
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
  data: LearningMaterialProcessingJobData,
) {
  const startedAt = Date.now();
  const attempt = await getDb().query.topicMaterialUploadAttempts.findFirst({
    where: eq(topicMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === LEARNING_STATUS.uploadSucceeded) {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;
  let currentStage: LearningMaterialUploadAttemptStage =
    LEARNING_STATUS.uploadStageExtraction;

  try {
    console.info("[learning-material-worker] processing start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      classroomId: data.classroomId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    });

    console.info("[learning-material-worker] topic access check start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      userId: data.userId,
    });
    const topic = await getTeacherTopicAccess(data.userId, data.topicId);
    if (!topic) {
      throw new Error("Topic not found or user is no longer authorized.");
    }
    console.info("[learning-material-worker] topic access check complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      classroomId: topic.classroomId,
    });

    if (!attempt.storagePath) {
      throw new Error("Uploaded file could not be found for processing.");
    }

    console.info("[learning-material-worker] marking extraction started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
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
    console.info("[learning-material-worker] download start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
      materialId,
    });
    const buffer = await downloadLearningMaterial(attempt.storagePath);
    console.info("[learning-material-worker] download complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
      materialId,
      sizeBytes: buffer.byteLength,
    });

    console.info("[learning-material-worker] extraction start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
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
      topicId: data.topicId,
    });
    const extractedText = sourceDocument.extractedText;

    console.info("[learning-material-worker] extraction complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      extractedTextLength: extractedText.length,
      segmentCount: sourceDocument.segments.length,
    });

    currentStage = LEARNING_STATUS.uploadStageAnalysis;
    console.info("[learning-material-worker] marking analysis started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageAnalysis,
    });

    console.info("[learning-material-worker] grounding map start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
      segmentCount: sourceDocument.segments.length,
    });
    const groundingMap = await buildMaterialGroundingMap({
      topicTitle: topic.title,
      materialId,
      materialTitle: data.title?.trim() || data.fileName,
      sourceDocument,
      traceId: data.attemptId,
      topicId: data.topicId,
    });

    const analysis = buildMaterialAnalysisPreview({
      groundingMap,
    });

    console.info("[learning-material-worker] analysis complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      analysisKeys: Object.keys(analysis).join(","),
      summaryLength: typeof analysis.summary === "string" ? analysis.summary.length : 0,
      clarifyingQuestionCount: Array.isArray(analysis.clarifyingQuestions)
        ? analysis.clarifyingQuestions.length
        : 0,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material review failed for this file.");
    }

    currentStage = LEARNING_STATUS.uploadStageIndexing;
    console.info("[learning-material-worker] marking indexing started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageIndexing,
    });

    console.info("[learning-material-worker] material insert start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    const [material] = await getDb()
      .insert(topicMaterials)
      .values({
        id: materialId,
        topicId: data.topicId,
        uploadedByUserId: data.userId,
        title: data.title?.trim() || data.fileName,
        description: data.description?.trim() || null,
        materialKind: inferMaterialKind(data.mimeType),
        storageBucket: attempt.storageBucket,
        storagePath: data.storagePath,
        publicUrl: buildLearningMaterialAccessPath(materialId),
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        extractionStatus: LEARNING_STATUS.materialCompleted,
        extractionError: null,
        indexingStatus: LEARNING_STATUS.materialProcessing,
        indexingError: null,
        extractedText,
        sourceDocument,
        groundingMap,
        coverageReview: analysis,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const persistedMaterial = requireValue(
      material,
      `Failed to create topic material ${materialId} for upload attempt ${data.attemptId}`,
    );
    console.info("[learning-material-worker] material insert complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });

    currentStage = LEARNING_STATUS.uploadStagePackBuild;
    console.info("[learning-material-worker] marking pack build started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStagePackBuild,
      materialId,
    });

    console.info("[learning-material-worker] indexing and boundary sync start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await indexMaterialAndSyncBoundary({
      topicId: data.topicId,
      materialId,
      material: persistedMaterial,
      mimeType: data.mimeType,
      extractedText,
      analysis,
      sourceDocument,
      groundingMap,
      topic,
    });
    console.info("[learning-material-worker] indexing and boundary sync complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
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

    console.info("[learning-material-worker] batch finalizer enqueue start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      materialId,
    });
    const finalizeJob = await enqueueLearningMaterialBatchFinalize({
      batchId: attempt.batchId,
      topicId: data.topicId,
      classroomId: data.classroomId,
    });
    console.info("[learning-material-worker] batch finalizer enqueued", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      materialId,
      jobId: finalizeJob?.id ?? null,
    });

    console.info("[learning-material-worker] processing succeeded", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
      durationMs: Date.now() - startedAt,
    });

    return { success: true, materialId };
  } catch (error) {
    const failure = buildUploadAttemptFailure(currentStage, error);

    console.error("[learning-material-worker] processing failed", {
      attemptId: data.attemptId,
      topicId: data.topicId,
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
      topicId: data.topicId,
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
