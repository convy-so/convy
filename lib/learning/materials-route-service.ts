import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningTopics, topicMaterials } from "@/db/schema";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import {
  analyzeLearningMaterial,
  extractLearningMaterialText,
  generateMaterialGroundingSummary,
} from "@/lib/learning/materials";
import { indexLearningMaterialEvidence } from "@/lib/learning/evidence";
import { buildLearningMaterialAccessPath } from "@/lib/media-access";
import { replaceLearningMaterialEmbeddings } from "@/lib/learning/rag";
import { uploadLearningMaterial } from "@/lib/storage";
import { assertLearningMaterialFile } from "@/lib/security/uploads";
import { topicSourceBoundarySchema } from "@/lib/learning/types";

export function inferMaterialKind(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "document";
}

export async function getTeacherTopicOrNull(userId: string, topicId: string) {
  return getTeacherTopicAccess(userId, topicId);
}

export async function createTopicMaterial(params: {
  topicId: string;
  userId: string;
  topic: Awaited<ReturnType<typeof getTeacherTopicAccess>>;
  file: File;
  title: string;
  description: string;
}) {
  const { file, topicId, userId, topic } = params;
  if (!topic) throw new Error("Topic not found");

  assertLearningMaterialFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const mimeType = detected?.mime || file.type || "application/octet-stream";
  assertLearningMaterialFile({ name: file.name, size: file.size, type: mimeType });

  const materialId = nanoid();
  const uploaded = await uploadLearningMaterial(buffer, topicId, materialId, mimeType, file.name);

  const [material] = await getDb()
    .insert(topicMaterials)
    .values({
      id: materialId,
      topicId,
      uploadedByUserId: userId,
      title: params.title.trim() || file.name,
      description: params.description.trim() || null,
      materialKind: inferMaterialKind(mimeType),
      storageBucket: uploaded.bucket,
      storagePath: uploaded.path,
      publicUrl: buildLearningMaterialAccessPath(materialId),
      mimeType,
      sizeBytes: file.size,
      extractionStatus: "processing",
      indexingStatus: "pending",
      extractedText: null,
      analysis: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return { material, buffer, mimeType, topic };
}

export async function enrichMaterialContent(params: {
  materialId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  topic: NonNullable<Awaited<ReturnType<typeof getTeacherTopicAccess>>>;
}) {
  let extractedText = "";
  let analysis: Record<string, unknown> = {};
  let groundingSummary = "";

  try {
    extractedText = await extractLearningMaterialText({
      buffer: params.buffer,
      filename: params.fileName,
      mimeType: params.mimeType,
    });
    analysis = await analyzeLearningMaterial({
      topicTitle: params.topic.title,
      topicDescription: params.topic.description,
      learningOutcomes: params.topic.learningOutcomes,
      materialText: extractedText,
    });
    groundingSummary = await generateMaterialGroundingSummary({
      topicTitle: params.topic.title,
      materialText: extractedText,
    });

    await getDb().update(topicMaterials).set({
      extractionStatus: "completed",
      extractionError: null,
      extractedText,
      analysis: { ...analysis, groundingSummary },
      indexingStatus: "processing",
      indexingError: null,
      updatedAt: new Date(),
    }).where(eq(topicMaterials.id, params.materialId));
  } catch (error) {
    await getDb().update(topicMaterials).set({
      extractionStatus: "failed",
      extractionError: error instanceof Error ? error.message : "Material extraction failed",
      indexingStatus: "failed",
      indexingError: "Indexing skipped because extraction failed.",
      updatedAt: new Date(),
    }).where(eq(topicMaterials.id, params.materialId));
    throw error;
  }

  return { extractedText, analysis, groundingSummary };
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
}
