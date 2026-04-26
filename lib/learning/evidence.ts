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
import { searchLearningTopicContext } from "@/lib/learning/rag";
import {
  chunkText,
  countTokens,
  DEFAULT_CHUNKING_VERSION,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_VERSION,
  generateEmbedding,
  generateEmbeddings,
} from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";
import { buildRetrievalContent, hashContent } from "@/lib/retrieval/metadata";

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

const langConfigMap: Record<string, string> = {
  en: "english",
  fr: "french",
  de: "german",
};

function buildLearningEvidenceContent(params: {
  sourceType: "material" | "report" | "interaction" | "pattern";
  sourceTitle?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  language?: string | null;
  interactionType?: string | null;
  phaseType?: string | null;
  conceptKey?: string | null;
  scopeType?: string | null;
  rawContent: string;
}) {
  return buildRetrievalContent({
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
    rawContent: params.rawContent,
  });
}

function buildReportEvidenceText(report: {
  topic?: { title?: string | null } | null;
  masteryPercent: number;
  report: Record<string, unknown>;
}) {
  const payload = report.report as Record<string, unknown>;
  const conceptProgress = Array.isArray(payload.conceptProgress)
    ? payload.conceptProgress
    : [];
  const identifiedGaps = Array.isArray(payload.identifiedGaps)
    ? payload.identifiedGaps
    : [];
  const riskFlags = Array.isArray(payload.riskFlags) ? payload.riskFlags : [];
  const recommendedTeacherActions = Array.isArray(payload.recommendedTeacherActions)
    ? payload.recommendedTeacherActions
    : [];

  return [
    `Topic: ${report.topic?.title ?? "Unknown topic"}`,
    `Mastery percent: ${report.masteryPercent}`,
    `Student summary: ${String(payload.studentSummary ?? "")}`,
    `Pedagogical summary: ${String(payload.pedagogicalSummary ?? "")}`,
    conceptProgress.length
      ? `Concept progress: ${JSON.stringify(conceptProgress)}`
      : null,
    identifiedGaps.length
      ? `Identified gaps: ${identifiedGaps.join("; ")}`
      : null,
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

async function replaceLearningEvidenceEmbeddings(
  params: ReplaceLearningEvidenceEmbeddingsParams,
) {
  const chunks = chunkText(params.content, { maxTokens: 320, overlap: 40 });
  if (chunks.length === 0) return [];

  const retrievalChunks = chunks.map((chunk) =>
    buildLearningEvidenceContent({
      sourceType: params.sourceType,
      sourceTitle: params.sourceTitle,
      subjectKey: params.subjectKey,
      gradeBand: params.gradeBand,
      language: params.language,
      interactionType: params.interactionType,
      phaseType: params.phaseType,
      conceptKey: params.conceptKey,
      scopeType: params.scopeType,
      rawContent: chunk,
    }),
  );

  const embeddings = await generateEmbeddings(retrievalChunks, {
    userId: params.studentUserId ?? undefined,
    surveyId: params.topicId ?? undefined,
  });

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
        chunks.map((content, index) => ({
          id: nanoid(),
          topicId: params.topicId ?? null,
          classroomId: params.classroomId ?? null,
          classroomStudentId: params.classroomStudentId ?? null,
          studentUserId: params.studentUserId ?? null,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chunkIndex: index,
          language: params.language ?? "en",
          subjectKey: params.subjectKey ?? null,
          gradeBand: params.gradeBand ?? null,
          interactionType: params.interactionType ?? null,
          phaseType: params.phaseType ?? null,
          conceptKey: params.conceptKey ?? null,
          scopeType: params.scopeType ?? null,
          sourceTitle: params.sourceTitle ?? null,
          embeddingModel: EMBEDDING_MODEL_NAME,
          embeddingVersion: EMBEDDING_VERSION,
          chunkingVersion: DEFAULT_CHUNKING_VERSION,
          contentHash: hashContent(content),
          sourceUpdatedAt: params.sourceUpdatedAt ?? new Date(),
          tokenCount: countTokens(content),
          rawContent: content,
          retrievalContent: retrievalChunks[index],
          content,
          metadata: params.metadata ?? {},
          embedding: embeddings[index],
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .returning();
  });
}

async function searchStudentLearningEvidenceContext(params: {
  classroomStudentId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const limit = params.limit ?? 8;
  const language = params.language ?? "en";
  const tsConfig = langConfigMap[language] ?? "english";
  const queryVector = JSON.stringify(await generateEmbedding(params.query));

  const vectorResults = await getDb()
    .select({
      id: learningEvidenceEmbeddings.id,
      content: learningEvidenceEmbeddings.rawContent,
      retrievalContent: learningEvidenceEmbeddings.retrievalContent,
      metadata: learningEvidenceEmbeddings.metadata,
      sourceType: learningEvidenceEmbeddings.sourceType,
      sourceId: learningEvidenceEmbeddings.sourceId,
      score:
        sql<number>`1 - (${learningEvidenceEmbeddings.embedding} <=> ${queryVector})`,
    })
    .from(learningEvidenceEmbeddings)
    .where(
      and(
        eq(
          learningEvidenceEmbeddings.classroomStudentId,
          params.classroomStudentId,
        ),
        sql`${learningEvidenceEmbeddings.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${learningEvidenceEmbeddings.embedding} <=> ${queryVector} ASC`)
    .limit(limit * 6);

  const textQuery = sql`websearch_to_tsquery(${tsConfig}, ${params.query})`;
  const textResults = await getDb()
    .select({
      id: learningEvidenceEmbeddings.id,
      content: learningEvidenceEmbeddings.rawContent,
      retrievalContent: learningEvidenceEmbeddings.retrievalContent,
      metadata: learningEvidenceEmbeddings.metadata,
      sourceType: learningEvidenceEmbeddings.sourceType,
      sourceId: learningEvidenceEmbeddings.sourceId,
      score:
        sql<number>`ts_rank(to_tsvector(${tsConfig}, ${learningEvidenceEmbeddings.retrievalContent}), ${textQuery})`,
    })
    .from(learningEvidenceEmbeddings)
    .where(
      and(
        eq(
          learningEvidenceEmbeddings.classroomStudentId,
          params.classroomStudentId,
        ),
        eq(learningEvidenceEmbeddings.language, language),
        sql`to_tsvector(${tsConfig}, ${learningEvidenceEmbeddings.retrievalContent}) @@ ${textQuery}`,
      ),
    )
    .orderBy(
      desc(
        sql`ts_rank(to_tsvector(${tsConfig}, ${learningEvidenceEmbeddings.retrievalContent}), ${textQuery})`,
      ),
    )
    .limit(limit * 6);

  const merged = new Map<
    string,
    {
      id: string;
      content: string;
      retrievalContent: string;
      metadata: Record<string, unknown> | null;
      sourceType: "material" | "report" | "interaction" | "pattern";
      sourceId: string;
      score: number;
    }
  >();

  for (const row of [...vectorResults, ...textResults]) {
    const existing = merged.get(row.id);
    if (!existing || row.score > existing.score) {
      merged.set(row.id, {
        id: row.id,
        content: row.content,
        retrievalContent: row.retrievalContent,
        metadata: row.metadata as Record<string, unknown> | null,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        score: row.score,
      });
    }
  }

  const reranked = await rerank(
    params.query,
    Array.from(merged.values())
      .slice(0, limit * 8)
      .map((row) => ({
        id: row.id,
        content: row.retrievalContent,
        metadata: row.metadata ?? {},
        sourceType: "document",
        sourceId: row.sourceId,
        score: row.score,
        createdAt: new Date(),
      })),
    limit,
  );

  const rowById = new Map(Array.from(merged.values()).map((row) => [row.id, row]));
  return reranked.flatMap((item) => {
    const row = rowById.get(item.id);
    if (!row) return [];

    return [
      {
        id: row.id,
        content: row.content,
        score: item.score,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        metadata: row.metadata ?? {},
      },
    ];
  });
}

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
    metadata: {
      ...(params.metadata ?? {}),
      role: params.role,
    },
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
    metadata: {
      masteryPercent: params.masteryPercent,
    },
    content: buildReportEvidenceText({
      topic: params.topicTitle ? { title: params.topicTitle } : null,
      masteryPercent: params.masteryPercent,
      report: params.report,
    }),
  });
}

export async function hydrateStudentLearningEvidence(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const [reports, interactions] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
      with: {
        topic: {
          with: {
            classroom: true,
          },
        },
      },
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.learningInteractions.findMany({
      where: eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      with: {
        topic: {
          with: {
            classroom: true,
          },
        },
      },
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
      limit: 40,
    }),
  ]);

  const reportIds = reports.map((report) => report.id);
  const interactionIds = interactions.map((interaction) => interaction.id);
  const [existingReportEmbeddings, existingInteractionEmbeddings] = await Promise.all([
    reportIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(
              learningEvidenceEmbeddings.classroomStudentId,
              params.classroomStudentId,
            ),
            eq(learningEvidenceEmbeddings.sourceType, "report"),
            inArray(learningEvidenceEmbeddings.sourceId, reportIds),
          ),
        })
      : Promise.resolve([]),
    interactionIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(
              learningEvidenceEmbeddings.classroomStudentId,
              params.classroomStudentId,
            ),
            eq(learningEvidenceEmbeddings.sourceType, "interaction"),
            inArray(learningEvidenceEmbeddings.sourceId, interactionIds),
          ),
        })
      : Promise.resolve([]),
  ]);

  const latestIndexedAt = new Map<string, Date>();
  for (const embedding of [...existingReportEmbeddings, ...existingInteractionEmbeddings]) {
    const key = `${embedding.sourceType}:${embedding.sourceId}`;
    const current = latestIndexedAt.get(key);
    const candidate = embedding.sourceUpdatedAt ?? embedding.updatedAt;
    if (!current || candidate > current) {
      latestIndexedAt.set(key, candidate);
    }
  }

  for (const report of reports) {
    const key = `report:${report.id}`;
    const sourceUpdatedAt = report.updatedAt ?? report.createdAt;
    const indexedAt = latestIndexedAt.get(key);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) {
      continue;
    }

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
    const key = `interaction:${interaction.id}`;
    const sourceUpdatedAt = interaction.updatedAt ?? interaction.createdAt;
    const indexedAt = latestIndexedAt.get(key);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) {
      continue;
    }

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

export async function answerTeacherStudentQuestion(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
  studentName: string;
  question: string;
  language: string;
}) {
  const [reports, interactions, retrievedEvidence] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      limit: 4,
      with: {
        topic: true,
      },
    }),
    getDb().query.learningInteractions.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      limit: 8,
      with: {
        topic: true,
      },
    }),
    searchStudentLearningEvidenceContext({
      classroomStudentId: params.classroomStudentId,
      query: params.question,
      language: params.language,
      limit: 8,
    }),
  ]);

  // --- Post-Retrieval Deterministic Deduplication ---
  // Create a fast lookup Set of all source IDs retrieved via semantic RAG
  const ragSourceIds = new Set(retrievedEvidence.map((item) => item.sourceId));

  // Filter out any recent fallbacks that already exist in the RAG evidence pool.
  // We keep the RAG version because it contains the semantic relevance `score`
  // which the LLM uses for weighting its conclusions.
  const uniqueReports = reports.filter((report) => !ragSourceIds.has(report.id));
  const uniqueInteractions = interactions.filter(
    (interaction) => !ragSourceIds.has(interaction.id),
  );

  return await generateStructuredOutput({
    schema: teacherEvidenceAnswerSchema,

    prompt: `Answer a teacher's question about a student's learning trajectory.

Reply in ${params.language}.

Student: ${params.studentName}
Question: ${params.question}

Most relevant evidence:
${JSON.stringify(
      retrievedEvidence.map((item) => ({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        score: item.score,
        content: item.content,
        metadata: item.metadata,
      })),
    )}

Recent reports fallback (excluding exact matches above):
${JSON.stringify(
      uniqueReports.map((report) => ({
        topicTitle: report.topic?.title ?? null,
        masteryPercent: report.masteryPercent,
        report: report.report,
      })),
    )}

Recent interactions fallback (excluding exact matches above):
${JSON.stringify(
      uniqueInteractions.map((interaction) => ({
        topicTitle: interaction.topic?.title ?? null,
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
      })),
    )}

Rules:
- answer only from the supplied evidence
- prioritize the most relevant evidence over simple recency
- be candid when evidence is insufficient
- focus on understanding, struggle, and development rather than just correctness
- include evidenceHighlights only for the strongest directly relevant signals`,
  });
}
