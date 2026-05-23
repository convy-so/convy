import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  learningEvidenceEmbeddings,
  learningTopics,
  topicMaterialUploadAttempts,
  topicMaterials,
} from "@/db/schema";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import {
  analyzeLearningMaterial,
  extractLearningMaterialText,
} from "@/lib/learning/materials";
import { indexLearningMaterialEvidence } from "@/lib/learning/evidence";
import { buildLearningMaterialAccessPath } from "@/lib/media-access";
import { replaceLearningMaterialEmbeddings } from "@/lib/learning/rag";
import {
  deleteLearningMaterial,
  downloadLearningMaterial,
} from "@/lib/storage";
import { rebuildTopicGroundingPack } from "@/lib/learning/topic-grounding-pack-service";
import { topicSourceBoundarySchema } from "@/lib/learning/types";
import { publishClassroomRealtimeEvent } from "@/lib/realtime";
import type { LearningMaterialProcessingJobData } from "@/lib/queue";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function inferMaterialKind(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "document";
}

export function normalizeDetectedLearningMaterialMime(params: {
  filename: string;
  fileType?: string | null;
  detectedMime?: string | null;
}) {
  const extension = params.filename.split(".").pop()?.trim().toLowerCase();
  const mime = params.detectedMime || params.fileType || "application/octet-stream";

  if (
    extension === "docx" &&
    (mime === "application/zip" ||
      mime === "application/x-zip-compressed" ||
      mime === "application/octet-stream")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return mime;
}

export function isMaterialAnalysisFailed(
  analysis: Record<string, unknown> | null | undefined,
) {
  return (
    analysis?.analysisStatus === "failed" ||
    analysis?.status === "failed" ||
    typeof analysis?.analysisError === "string"
  );
}

export async function getTeacherTopicOrNull(userId: string, topicId: string) {
  return getTeacherTopicAccess(userId, topicId);
}

async function publishMaterialUploadUpdated(params: {
  classroomId: string;
  topicId: string;
  batchId: string;
  attemptId: string;
}) {
  await publishClassroomRealtimeEvent(params.classroomId, {
    type: "learning_material_upload_updated",
    topicId: params.topicId,
    batchId: params.batchId,
    attemptIds: [params.attemptId],
  });
}

export async function updateLearningMaterialUploadAttempt(params: {
  attemptId: string;
  classroomId?: string;
  topicId?: string;
  batchId?: string;
  status?: "queued" | "processing" | "succeeded" | "failed";
  stage?: "upload" | "extraction" | "review" | "indexing";
  failureMessage?: string | null;
  materialId?: string | null;
}) {
  const [attempt] = await getDb()
    .update(topicMaterialUploadAttempts)
    .set({
      ...(params.status ? { status: params.status } : {}),
      ...(params.stage ? { stage: params.stage } : {}),
      ...(params.failureMessage !== undefined
        ? { failureMessage: params.failureMessage }
        : {}),
      ...(params.materialId !== undefined ? { materialId: params.materialId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(topicMaterialUploadAttempts.id, params.attemptId))
    .returning();

  const classroomId = params.classroomId;
  if (attempt && classroomId) {
    await publishMaterialUploadUpdated({
      classroomId,
      topicId: params.topicId ?? attempt.topicId,
      batchId: params.batchId ?? attempt.batchId,
      attemptId: attempt.id,
    });
  }

  return attempt;
}

export async function createLearningMaterialUploadAttempt(params: {
  id: string;
  batchId: string;
  topicId: string;
  uploadedByUserId: string;
  fileName: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status: "queued" | "failed";
  stage?: "upload" | "extraction" | "review" | "indexing";
  failureMessage?: string | null;
}) {
  const [attempt] = await getDb()
    .insert(topicMaterialUploadAttempts)
    .values({
      id: params.id,
      batchId: params.batchId,
      topicId: params.topicId,
      uploadedByUserId: params.uploadedByUserId,
      fileName: params.fileName,
      title: params.title?.trim() || null,
      description: params.description?.trim() || null,
      mimeType: params.mimeType ?? null,
      sizeBytes: params.sizeBytes ?? null,
      storageBucket: params.storageBucket ?? null,
      storagePath: params.storagePath ?? null,
      status: params.status,
      stage: params.stage ?? "upload",
      failureMessage: params.failureMessage ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return attempt;
}

export async function indexMaterialAndSyncBoundary(params: {
  topicId: string;
  materialId: string;
  material: typeof topicMaterials.$inferSelect;
  mimeType: string;
  extractedText: string;
  analysis: Record<string, unknown>;
  topic: NonNullable<Awaited<ReturnType<typeof getTeacherTopicAccess>>>;
}) {
  console.info("[learning-material-upload] extracted content before embeddings", {
    topicId: params.topicId,
    materialId: params.materialId,
    characterLength: params.extractedText.length,
  });
  console.log(
    [
      "----- BEGIN EXTRACTED LEARNING MATERIAL -----",
      params.extractedText,
      "----- END EXTRACTED LEARNING MATERIAL -----",
    ].join("\n"),
  );

  await replaceLearningMaterialEmbeddings({
    classroomId: params.topic.classroomId,
    topicId: params.topicId,
    materialId: params.materialId,
    content: params.extractedText,
    topicTitle: params.topic.title,
    materialTitle: params.material.title,
    materialKind: params.material.materialKind,
    subjectKey: params.topic.subjectKey,
    gradeBand: params.topic.classroom.gradeBand,
    contentLocale: params.topic.contentLocale,
    sourceUpdatedAt: params.material.updatedAt,
    metadata: {
      title: params.material.title,
      mimeType: params.mimeType,
      topicTitle: params.topic.title,
      subjectKey: params.topic.subjectKey,
      gradeBand: params.topic.classroom.gradeBand,
      locale: params.topic.contentLocale,
    },
  });

  await indexLearningMaterialEvidence({
    classroomId: params.topic.classroomId,
    topicId: params.topicId,
    materialId: params.materialId,
    topicTitle: params.topic.title,
    title: params.material.title,
    description: params.material.description,
    mimeType: params.mimeType,
    content: params.extractedText,
    subjectKey: params.topic.subjectKey,
    gradeBand: params.topic.classroom.gradeBand,
    language: params.topic.contentLocale,
    sourceUpdatedAt: params.material.updatedAt,
  });

  const currentTopic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
    columns: { sourceBoundary: true },
  });
  const existingBoundary = topicSourceBoundarySchema.parse(currentTopic?.sourceBoundary ?? {});
  const updatedBoundary = topicSourceBoundarySchema.parse({
    ...existingBoundary,
    rigorNotes: Array.from(new Set([...(existingBoundary.rigorNotes || []), ...((params.analysis.rigorNotes as string[]) || [])])),
    notationNotes: Array.from(new Set([...(existingBoundary.notationNotes || []), ...((params.analysis.notationNotes as string[]) || [])])),
    scopeNotes: Array.from(new Set([...(existingBoundary.scopeNotes || []), ...((params.analysis.scopeNotes as string[]) || [])])),
  });

  await Promise.all([
    getDb().update(topicMaterials).set({ indexingStatus: "completed", indexingError: null, updatedAt: new Date() }).where(eq(topicMaterials.id, params.materialId)),
    getDb().update(learningTopics).set({ sourceBoundary: updatedBoundary, lastMaterialSyncAt: new Date(), updatedAt: new Date() }).where(eq(learningTopics.id, params.topicId)),
  ]);

  try {
    await rebuildTopicGroundingPack(params.topicId);
  } catch (error) {
    console.error("[learning-material-upload] topic grounding pack rebuild failed", {
      topicId: params.topicId,
      materialId: params.materialId,
      error: getErrorMessage(error, "Topic grounding pack rebuild failed"),
    });
  }
}

async function deleteMaterialProcessingArtifacts(params: {
  materialId?: string | null;
  storagePath?: string | null;
}) {
  if (params.materialId) {
    await getDb()
      .delete(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.sourceType, "material"),
          eq(learningEvidenceEmbeddings.sourceId, params.materialId),
        ),
      );
    await getDb()
      .delete(topicMaterials)
      .where(eq(topicMaterials.id, params.materialId));
  }

  if (params.storagePath) {
    try {
      await deleteLearningMaterial(params.storagePath);
    } catch (error) {
      console.warn("[learning-material-worker] failed to cleanup storage object", {
        storagePath: params.storagePath,
        error: getErrorMessage(error, "Storage cleanup failed"),
      });
    }
  }
}

export async function processLearningMaterialUploadAttempt(
  data: LearningMaterialProcessingJobData,
) {
  const attempt = await getDb().query.topicMaterialUploadAttempts.findFirst({
    where: eq(topicMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === "succeeded") {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;

  try {
    const topic = await getTeacherTopicAccess(data.userId, data.topicId);
    if (!topic) {
      throw new Error("Topic not found or user is no longer authorized.");
    }

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "extraction",
      failureMessage: null,
    });

    const buffer = await downloadLearningMaterial(data.storagePath);
    const extractedText = await extractLearningMaterialText({
      buffer,
      filename: data.fileName,
      mimeType: data.mimeType,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "review",
    });

    const analysis = await analyzeLearningMaterial({
      topicTitle: topic.title,
      topicDescription: topic.description,
      learningOutcomes: topic.learningOutcomes,
      materialText: extractedText,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material review failed for this file.");
    }

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "indexing",
    });

    materialId = nanoid();
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
        extractionStatus: "completed",
        extractionError: null,
        indexingStatus: "processing",
        indexingError: null,
        extractedText,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await indexMaterialAndSyncBoundary({
      topicId: data.topicId,
      materialId,
      material,
      mimeType: data.mimeType,
      extractedText,
      analysis,
      topic,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "succeeded",
      stage: "indexing",
      failureMessage: null,
      materialId,
    });

    return { success: true, materialId };
  } catch (error) {
    const failureMessage = getErrorMessage(error, "Learning material processing failed");

    await deleteMaterialProcessingArtifacts({
      materialId,
      storagePath: data.storagePath,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "failed",
      failureMessage,
    });

    return {
      success: false,
      error: failureMessage,
    };
  }
}
