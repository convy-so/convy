import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { learningEvidenceEmbeddings } from "@/shared/db/schema";
import {
  DEFAULT_CHUNKING_VERSION,
  EMBEDDING_VERSION,
  STANDARD_MODEL,
  prepareEmbeddingsForIndexing,
} from "@/shared/retrieval/core";

import {
  buildMaterialEvidenceText,
  buildReportEvidenceText,
  type ReplaceLearningEvidenceEmbeddingsParams,
} from "./evidence-domain";

export async function replaceLearningEvidenceEmbeddings(
  params: ReplaceLearningEvidenceEmbeddingsParams,
) {
  const chunks = await prepareEmbeddingsForIndexing({
    content: params.content,
    chunkOptions: { maxTokens: 320 },
    headerEntries: [
      { label: "Source type", value: params.sourceType },
      { label: "Title", value: params.sourceTitle },
      { label: "Subject", value: params.subjectKey },
      { label: "Grade band", value: params.gradeBand },
      { label: "Language", value: params.language },
      { label: "Interaction type", value: params.interactionType },
      { label: "Phase type", value: params.phaseType },
      { label: "Concept", value: params.conceptKey },
      { label: "Scope", value: params.scopeType },
    ],
    attribution: {
      userId: params.studentUserId ?? undefined,
      feature: `learning-evidence-indexing:${params.sourceType}`,
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  return await getDb().transaction(async (tx) => {
    await tx
      .delete(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.sourceType, params.sourceType),
          eq(learningEvidenceEmbeddings.sourceId, params.sourceId),
          params.language
            ? eq(learningEvidenceEmbeddings.language, params.language)
            : undefined,
        ),
      );

    return await tx
      .insert(learningEvidenceEmbeddings)
      .values(
        chunks.map((chunk) => ({
          id: nanoid(),
          topicId: params.topicId ?? null,
          classroomId: params.classroomId ?? null,
          classroomStudentId: params.classroomStudentId ?? null,
          studentUserId: params.studentUserId ?? null,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chunkIndex: chunk.chunkIndex,
          language: params.language ?? "en",
          subjectKey: params.subjectKey ?? null,
          gradeBand: params.gradeBand ?? null,
          interactionType: params.interactionType ?? null,
          phaseType: params.phaseType ?? null,
          conceptKey: params.conceptKey ?? null,
          scopeType: params.scopeType ?? null,
          sourceTitle: params.sourceTitle ?? null,
          embeddingModel: STANDARD_MODEL,
          embeddingVersion: EMBEDDING_VERSION,
          chunkingVersion: DEFAULT_CHUNKING_VERSION,
          contentHash: chunk.contentHash,
          sourceUpdatedAt: params.sourceUpdatedAt ?? new Date(),
          tokenCount: chunk.tokenCount,
          rawContent: chunk.rawContent,
          retrievalContent: chunk.retrievalContent,
          content: chunk.rawContent,
          metadata: params.metadata ?? {},
          embedding: chunk.embedding,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .returning();
  });
}

export async function indexLearningInteractionEvidence(params: {
  interactionId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  topicId?: string | null;
  classroomId?: string | null;
  topicTitle?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  interactionType: string;
  role: string;
  content: string;
  phaseType?: string | null;
  conceptKey?: string | null;
  metadata?: Record<string, unknown>;
  sourceUpdatedAt?: Date | null;
}) {
  return await replaceLearningEvidenceEmbeddings({
    sourceType: "interaction",
    sourceId: params.interactionId,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    topicId: params.topicId ?? null,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.topicTitle ?? "Learning interaction",
    interactionType: params.interactionType,
    phaseType: params.phaseType ?? null,
    conceptKey: params.conceptKey ?? null,
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: { ...(params.metadata ?? {}), role: params.role },
    content: `${params.role}: ${params.content}`,
  });
}

export async function indexLearningReportEvidence(params: {
  reportId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  topicId: string;
  classroomId?: string | null;
  topicTitle?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  masteryPercent: number;
  report: Record<string, unknown>;
  sourceUpdatedAt?: Date | null;
}) {
  return await replaceLearningEvidenceEmbeddings({
    sourceType: "report",
    sourceId: params.reportId,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    topicId: params.topicId,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.topicTitle ?? "Progress report",
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: { masteryPercent: params.masteryPercent },
    content: buildReportEvidenceText({
      topic: params.topicTitle ? { title: params.topicTitle } : null,
      masteryPercent: params.masteryPercent,
      report: params.report,
    }),
  });
}

export async function indexLearningMaterialEvidence(params: {
  materialId: string;
  topicId: string;
  classroomId?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  sourceTitle?: string | null;
  sourceUpdatedAt?: Date | null;
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
}) {
  return await replaceLearningEvidenceEmbeddings({
    sourceType: "material",
    sourceId: params.materialId,
    topicId: params.topicId,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.sourceTitle ?? "Learning material",
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: {
      extractor:
        typeof params.sourceDocument.extractor === "string"
          ? params.sourceDocument.extractor
          : null,
      segmentCount: Array.isArray(params.sourceDocument.segments)
        ? params.sourceDocument.segments.length
        : 0,
    },
    content: buildMaterialEvidenceText({
      sourceDocument: params.sourceDocument,
      groundingMap: params.groundingMap,
    }),
  });
}
