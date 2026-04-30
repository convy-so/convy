import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  learningEvidenceEmbeddings,
  learningInteractions,
  studentProgressReports,
} from "@/db/schema";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildTeacherEvidenceAnswerPrompt } from "@/lib/learning/prompts/evidence";
import { searchLearningTopicContext } from "@/lib/learning/rag";
import {
  STANDARD_MODEL,
  EMBEDDING_VERSION,
  DEFAULT_CHUNKING_VERSION,
  LANG_TO_PG_CONFIG,
  type PgLanguage,
  buildRRFCandidatePool,
  prepareEmbeddingsForIndexing,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "@/lib/rag/core";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";

// ─── Types ────────────────────────────────────────────────────────────────────

type EvidenceContextItem = {
  id: string;
  content: string;
  score: number;
  sourceType: "material" | "report" | "interaction" | "pattern";
  sourceId: string;
  metadata: Record<string, unknown>;
};

type ReplaceLearningEvidenceEmbeddingsParams = {
  sourceType: "material" | "report" | "interaction" | "pattern";
  sourceId: string;
  content: string;
  classroomStudentId?: string | null;
  studentUserId?: string | null;
  topicId?: string | null;
  classroomId?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  sourceTitle?: string | null;
  interactionType?: string | null;
  phaseType?: string | null;
  conceptKey?: string | null;
  scopeType?: string | null;
  sourceUpdatedAt?: Date | null;
  metadata?: Record<string, unknown>;
};

const teacherEvidenceAnswerSchema = z.object({
  answer: z.string(),
  evidenceHighlights: z.array(z.string()).default([]),
});

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function getPgLanguage(lang?: string | null): PgLanguage {
  return LANG_TO_PG_CONFIG[lang ?? "en"] ?? "english";
}

function buildReportEvidenceText(report: {
  topic?: { title?: string | null } | null;
  masteryPercent: number;
  report: Record<string, unknown>;
}) {
  const payload = report.report;
  const conceptProgress = Array.isArray(payload.conceptProgress) ? payload.conceptProgress : [];
  const identifiedGaps = Array.isArray(payload.identifiedGaps) ? payload.identifiedGaps : [];
  const riskFlags = Array.isArray(payload.riskFlags) ? payload.riskFlags : [];
  const recommendedTeacherActions = Array.isArray(payload.recommendedTeacherActions)
    ? payload.recommendedTeacherActions
    : [];

  return [
    `Topic: ${report.topic?.title ?? "Unknown topic"}`,
    `Mastery percent: ${report.masteryPercent}`,
    `Student summary: ${String(payload.studentSummary ?? "")}`,
    `Pedagogical summary: ${String(payload.pedagogicalSummary ?? "")}`,
    conceptProgress.length ? `Concept progress: ${JSON.stringify(conceptProgress)}` : null,
    identifiedGaps.length ? `Identified gaps: ${identifiedGaps.join("; ")}` : null,
    riskFlags.length ? `Risk flags: ${riskFlags.join("; ")}` : null,
    recommendedTeacherActions.length
      ? `Recommended teacher actions: ${recommendedTeacherActions.join("; ")}`
      : null,
    `Transfer readiness: ${String(payload.transferReadiness ?? "unknown")}`,
    `Confidence score: ${String(payload.studentConfidenceScore ?? "unknown")}`,
    `Metacognitive mirror: ${String(payload.metacognitiveMirror ?? "")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Indexing ─────────────────────────────────────────────────────────────────

/**
 * Replaces all stored embedding chunks for a piece of learning evidence
 * (material, interaction, report, or pattern).
 *
 * Idempotent: deletes existing chunks for (sourceType, sourceId, language)
 * then re-inserts fresh ones.
 */
async function replaceLearningEvidenceEmbeddings(
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

  if (chunks.length === 0) return [];

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

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Hybrid search (vector + BM25, RRF-fused, reranked) over learning evidence
 * embeddings scoped to a single student.
 */
async function searchStudentLearningEvidenceContext(params: {
  classroomStudentId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const limit = params.limit ?? 8;
  const lang = getPgLanguage(params.language);
  const queryVector = JSON.stringify(
    await generateEmbedding(params.query, { feature: "learning-evidence-search" }),
  );

  const scoreSql = vectorSimilaritySql(learningEvidenceEmbeddings.embedding, queryVector);
  const rankSql = textRankSql(learningEvidenceEmbeddings.retrievalContent, params.query, lang);
  const matchSql = textMatchSql(learningEvidenceEmbeddings.retrievalContent, params.query, lang);

  const [vectorRows, textRows] = await Promise.all([
    getDb()
      .select({
        id: learningEvidenceEmbeddings.id,
        content: learningEvidenceEmbeddings.rawContent,
        retrievalContent: learningEvidenceEmbeddings.retrievalContent,
        metadata: learningEvidenceEmbeddings.metadata,
        sourceType: learningEvidenceEmbeddings.sourceType,
        sourceId: learningEvidenceEmbeddings.sourceId,
        score: scoreSql,
      })
      .from(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          sql`${learningEvidenceEmbeddings.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${learningEvidenceEmbeddings.embedding} <=> ${queryVector}::vector ASC`)
      .limit(limit * 6),

    getDb()
      .select({
        id: learningEvidenceEmbeddings.id,
        content: learningEvidenceEmbeddings.rawContent,
        retrievalContent: learningEvidenceEmbeddings.retrievalContent,
        metadata: learningEvidenceEmbeddings.metadata,
        sourceType: learningEvidenceEmbeddings.sourceType,
        sourceId: learningEvidenceEmbeddings.sourceId,
        score: rankSql,
      })
      .from(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          eq(learningEvidenceEmbeddings.language, params.language ?? "en"),
          matchSql,
        ),
      )
      .orderBy(desc(rankSql))
      .limit(limit * 6),
  ]);

  // Use RRF fusion instead of the old max-score merge
  const candidatePool = buildRRFCandidatePool(vectorRows, textRows, limit * 8).map((row) => ({
    id: row.id,
    content: row.retrievalContent ?? row.content,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    sourceType: "document" as const,
    sourceId: row.sourceId,
    score: row.score,
    createdAt: new Date(),
  }));

  const reranked = await rerank(params.query, candidatePool, limit, {
    feature: "learning-evidence-search",
  });

  // Re-hydrate to the richer EvidenceContextItem shape
  const rowById = new Map(
    [...vectorRows, ...textRows].map((row) => [row.id, row]),
  );

  return reranked.flatMap((item): EvidenceContextItem[] => {
    const row = rowById.get(item.id);
    if (!row) return [];
    return [
      {
        id: row.id,
        content: row.content,
        score: item.score,
        sourceType: row.sourceType as EvidenceContextItem["sourceType"],
        sourceId: row.sourceId,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      },
    ];
  });
}

// ─── Public Indexing API ──────────────────────────────────────────────────────

export async function indexLearningMaterialEvidence(params: {
  classroomId?: string | null;
  topicId: string;
  materialId: string;
  topicTitle?: string | null;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  content: string;
  subjectKey?: string | null;
  gradeBand?: string | null;
  language?: string | null;
  sourceUpdatedAt?: Date | null;
}) {
  return await replaceLearningEvidenceEmbeddings({
    sourceType: "material",
    sourceId: params.materialId,
    topicId: params.topicId,
    classroomId: params.classroomId ?? null,
    language: params.language ?? "en",
    subjectKey: params.subjectKey ?? null,
    gradeBand: params.gradeBand ?? null,
    sourceTitle: params.title ?? params.topicTitle ?? "Learning material",
    sourceUpdatedAt: params.sourceUpdatedAt ?? null,
    metadata: {
      title: params.title ?? null,
      description: params.description ?? null,
      mimeType: params.mimeType ?? null,
      topicTitle: params.topicTitle ?? null,
    },
    content: params.content,
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

// ─── On-Demand Hydration ──────────────────────────────────────────────────────

/**
 * Checks which reports and interactions are stale (source changed since last
 * embed) and re-indexes them lazily. Called before evidence search to keep
 * the index current without a background job.
 */
export async function hydrateStudentLearningEvidence(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const [reports, interactions] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
      with: { topic: { with: { classroom: true } } },
      orderBy: (table, { desc: d }) => [d(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.learningInteractions.findMany({
      where: eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      with: { topic: { with: { classroom: true } } },
      orderBy: (table, { desc: d }) => [d(table.updatedAt)],
      limit: 40,
    }),
  ]);

  const reportIds = reports.map((r) => r.id);
  const interactionIds = interactions.map((i) => i.id);

  const [existingReportEmbs, existingInteractionEmbs] = await Promise.all([
    reportIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(learningEvidenceEmbeddings.sourceType, "report"),
            inArray(learningEvidenceEmbeddings.sourceId, reportIds),
          ),
        })
      : Promise.resolve([]),
    interactionIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(learningEvidenceEmbeddings.sourceType, "interaction"),
            inArray(learningEvidenceEmbeddings.sourceId, interactionIds),
          ),
        })
      : Promise.resolve([]),
  ]);

  // Build a map of the latest indexed timestamp per source
  const latestIndexedAt = new Map<string, Date>();
  for (const emb of [...existingReportEmbs, ...existingInteractionEmbs]) {
    const key = `${emb.sourceType}:${emb.sourceId}`;
    const candidate = emb.sourceUpdatedAt ?? emb.updatedAt;
    const current = latestIndexedAt.get(key);
    if (!current || candidate > current) latestIndexedAt.set(key, candidate);
  }

  for (const report of reports) {
    const sourceUpdatedAt = report.updatedAt ?? report.createdAt;
    const indexedAt = latestIndexedAt.get(`report:${report.id}`);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) continue;

    await indexLearningReportEvidence({
      reportId: report.id,
      classroomStudentId: report.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      topicId: report.topicId,
      classroomId: report.topic?.classroomId ?? null,
      topicTitle: report.topic?.title ?? null,
      language: report.sourceLocale,
      subjectKey: report.topic?.subjectKey ?? null,
      gradeBand: report.topic?.classroom.gradeBand ?? null,
      masteryPercent: report.masteryPercent,
      report: report.report as Record<string, unknown>,
      sourceUpdatedAt,
    });
  }

  for (const interaction of interactions) {
    const sourceUpdatedAt = interaction.updatedAt ?? interaction.createdAt;
    const indexedAt = latestIndexedAt.get(`interaction:${interaction.id}`);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) continue;

    await indexLearningInteractionEvidence({
      interactionId: interaction.id,
      classroomStudentId: interaction.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      topicId: interaction.topicId ?? null,
      classroomId: interaction.topic?.classroomId ?? null,
      topicTitle: interaction.topic?.title ?? null,
      language: interaction.topic?.contentLocale ?? "en",
      subjectKey: interaction.topic?.subjectKey ?? null,
      gradeBand: interaction.topic?.classroom.gradeBand ?? null,
      interactionType: interaction.interactionType,
      role: interaction.role,
      content: interaction.content,
      phaseType: interaction.phaseType ?? null,
      conceptKey: interaction.conceptKey ?? null,
      metadata: interaction.metadata as Record<string, unknown>,
      sourceUpdatedAt,
    });
  }
}

// ─── Public Retrieval API ─────────────────────────────────────────────────────

/**
 * Finds the most relevant learning evidence for a teacher's question about a
 * specific topic (material-level, not student-level).
 */
export async function findLearningEvidenceContext(params: {
  topicId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const results = await searchLearningTopicContext({
    topicId: params.topicId,
    query: params.query,
    contentLocale: params.language ?? "en",
    limit: params.limit ?? 6,
  });

  return results.map((result) => ({
    id: result.id,
    content: result.content,
    score: result.score,
    sourceType: "material",
    sourceId: result.sourceId ?? result.id,
    metadata: result.metadata ?? {},
  }));
}

/**
 * Answers a teacher's question about a specific student by combining
 * semantic evidence retrieval with structured output generation.
 */
export async function answerTeacherStudentQuestion(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
  studentName: string;
  question: string;
  language: string;
}) {
  const [reports, interactions, retrievedEvidence] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: (table, { eq: eqFn }) => eqFn(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc: d }) => [d(table.createdAt)],
      limit: 4,
      with: { topic: true },
    }),
    getDb().query.learningInteractions.findMany({
      where: (table, { eq: eqFn }) => eqFn(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc: d }) => [d(table.createdAt)],
      limit: 8,
      with: { topic: true },
    }),
    searchStudentLearningEvidenceContext({
      classroomStudentId: params.classroomStudentId,
      query: params.question,
      language: params.language,
      limit: 8,
    }),
  ]);

  // De-duplicate: remove fallback items already surfaced by the semantic search
  const ragSourceIds = new Set(retrievedEvidence.map((item) => item.sourceId));
  const uniqueReports = reports.filter((r) => !ragSourceIds.has(r.id));
  const uniqueInteractions = interactions.filter((i) => !ragSourceIds.has(i.id));

  return await generateStructuredOutput({
    schema: teacherEvidenceAnswerSchema,
    prompt: buildTeacherEvidenceAnswerPrompt({
      language: params.language,
      studentName: params.studentName,
      question: params.question,
      retrievedEvidence: retrievedEvidence.map((item) => ({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        score: item.score,
        content: item.content,
        metadata: item.metadata,
      })),
      uniqueReports: uniqueReports.map((reportItem) => ({
        topicTitle: reportItem.topic?.title ?? null,
        masteryPercent: reportItem.masteryPercent,
        report: reportItem.report,
      })),
      uniqueInteractions: uniqueInteractions.map((interactionItem) => ({
        topicTitle: interactionItem.topic?.title ?? null,
        role: interactionItem.role,
        interactionType: interactionItem.interactionType,
        content: interactionItem.content,
      })),
    }),
  });
}
