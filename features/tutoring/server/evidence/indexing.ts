import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { lessonEvidenceEmbeddings } from "@/shared/db/schema";
import {
  DEFAULT_CHUNKING_VERSION,
  EMBEDDING_VERSION,
  STANDARD_MODEL,
  prepareEmbeddingsForIndexing,
} from "@/shared/retrieval/core";

import {
  buildMaterialEvidenceText,
  buildReportEvidenceText,
  type ReplaceLessonEvidenceEmbeddingsParams,
} from "./evidence-domain";

export async function replaceLessonEvidenceEmbeddings(
  params: ReplaceLessonEvidenceEmbeddingsParams,
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
      feature: `lesson-evidence-indexing:${params.sourceType}`,
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  return await getDb().transaction(async (tx) => {
    await tx
      .delete(lessonEvidenceEmbeddings)
      .where(
        and(
          eq(lessonEvidenceEmbeddings.sourceType, params.sourceType),
          eq(lessonEvidenceEmbeddings.sourceId, params.sourceId),
          params.language
            ? eq(lessonEvidenceEmbeddings.language, params.language)
            : undefined,
        ),
      );

    return await tx
      .insert(lessonEvidenceEmbeddings)
      .values(
        chunks.map((chunk) => ({
          id: nanoid(),
          lessonId: params.lessonId ?? null,
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

export async function indexStudentInteractionEvidence(params: {
  interactionId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  lessonId?: string | null;
  classroomId?: string | null;
  lessonTitle?: string | null;
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
  return await replaceLessonEvidenceEmbeddings({
    sourceType: "interaction",
    sourceId: params.interactionId,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    lessonId: params.lessonId ?? null,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.lessonTitle ?? "Student interaction",
    interactionType: params.interactionType,
    phaseType: params.phaseType ?? null,
    conceptKey: params.conceptKey ?? null,
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: { ...(params.metadata ?? {}), role: params.role },
    content: `${params.role}: ${params.content}`,
  });
}

export async function indexStudentReportEvidence(params: {
  reportId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  lessonId: string;
  classroomId?: string | null;
  lessonTitle?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  masteryPercent: number;
  report: Record<string, unknown>;
  sourceUpdatedAt?: Date | null;
}) {
  return await replaceLessonEvidenceEmbeddings({
    sourceType: "report",
    sourceId: params.reportId,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    lessonId: params.lessonId,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.lessonTitle ?? "Progress report",
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: { masteryPercent: params.masteryPercent },
    content: buildReportEvidenceText({
      lesson: params.lessonTitle ? { title: params.lessonTitle } : null,
      masteryPercent: params.masteryPercent,
      report: params.report,
    }),
  });
}

export async function indexLessonMaterialEvidence(params: {
  materialId: string;
  lessonId: string;
  classroomId?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  sourceTitle?: string | null;
  sourceUpdatedAt?: Date | null;
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
}) {
  return await replaceLessonEvidenceEmbeddings({
    sourceType: "material",
    sourceId: params.materialId,
    lessonId: params.lessonId,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.sourceTitle ?? "Lesson material",
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

