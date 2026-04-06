import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getDb } from "@/db";
import {
  classroomStudents,
  learningInteractions,
  learningEvidenceEmbeddings,
  learningTopics,
  studentLearningPatternProfiles,
  studentProgressReports,
} from "@/db/schema";
import { flashLiteModel, generateAIResponse } from "@/lib/ai";
import {
  isMem0Configured,
  searchLearningPatternMemories,
} from "@/lib/learning/mem0";
import type { StudentLearningPatternProfile } from "@/lib/learning/pattern-types";
import type { TeacherProgressReport } from "@/lib/learning/types";
import { appLocaleLabels, normalizeAppLocale } from "@/lib/i18n/config";
import type { SupportedLanguage } from "@/lib/translation-service";
import { generateEmbedding, generateEmbeddings, chunkText } from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";
import type { SearchResult } from "@/lib/rag/search";

export type LearningEvidenceSourceType =
  | "material"
  | "report"
  | "interaction"
  | "pattern";

export interface LearningEvidenceSearchFilters {
  organizationId: string;
  topicId?: string;
  classroomStudentId?: string;
  studentUserId?: string;
  sourceType?: LearningEvidenceSourceType[];
  minDate?: Date;
  limit?: number;
  language?: SupportedLanguage;
}

export interface LearningEvidenceSearchResult extends SearchResult {
  sourceType: LearningEvidenceSourceType;
}

const langConfigMap: Record<SupportedLanguage, string> = {
  en: "english",
  fr: "french",
  de: "german",
  es: "spanish",
  it: "italian",
};

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function buildLearningSourceLabel(result: LearningEvidenceSearchResult) {
  const metadata = normalizeMetadata(result.metadata);
  const title =
    typeof metadata.title === "string"
      ? metadata.title
      : typeof metadata.topicTitle === "string"
        ? metadata.topicTitle
        : result.sourceType;

  switch (result.sourceType) {
    case "material":
      return `Material: ${title}`;
    case "report":
      return `Report: ${title}`;
    case "interaction":
      return `Interaction: ${title}`;
    case "pattern":
      return `Pattern: ${title}`;
    default:
      return title;
  }
}

export async function replaceLearningEvidenceSource(params: {
  organizationId: string;
  topicId?: string | null;
  classroomStudentId?: string | null;
  studentUserId?: string | null;
  sourceType: LearningEvidenceSourceType;
  sourceId: string;
  content: string;
  language?: SupportedLanguage | string | null;
  metadata?: Record<string, unknown>;
}) {
  await getDb()
    .delete(learningEvidenceEmbeddings)
    .where(
      and(
        eq(learningEvidenceEmbeddings.organizationId, params.organizationId),
        eq(learningEvidenceEmbeddings.sourceType, params.sourceType),
        eq(learningEvidenceEmbeddings.sourceId, params.sourceId),
      ),
    );

  const chunks = chunkText(params.content, { maxTokens: 300, overlap: 40 });
  if (chunks.length === 0) return [];

  const embeddings = await generateEmbeddings(chunks, {
    organizationId: params.organizationId,
  });

  return await getDb()
    .insert(learningEvidenceEmbeddings)
    .values(
      chunks.map((content, index) => ({
        id: nanoid(),
        organizationId: params.organizationId,
        topicId: params.topicId ?? null,
        classroomStudentId: params.classroomStudentId ?? null,
        studentUserId: params.studentUserId ?? null,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        chunkIndex: index,
        language: normalizeAppLocale(params.language ?? "en"),
        content,
        metadata: params.metadata ?? {},
        embedding: embeddings[index],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .returning();
}

async function vectorSearchLearning(
  query: string,
  filters: LearningEvidenceSearchFilters,
): Promise<LearningEvidenceSearchResult[]> {
  const limit = filters.limit ?? 20;
  const queryVector = JSON.stringify(await generateEmbedding(query, {
    organizationId: filters.organizationId,
  }));

  const rows = await getDb()
    .select({
      id: learningEvidenceEmbeddings.id,
      content: learningEvidenceEmbeddings.content,
      metadata: learningEvidenceEmbeddings.metadata,
      sourceType: learningEvidenceEmbeddings.sourceType,
      sourceId: learningEvidenceEmbeddings.sourceId,
      createdAt: learningEvidenceEmbeddings.createdAt,
      similarity: sql<number>`1 - (${learningEvidenceEmbeddings.embedding} <=> ${queryVector})`,
    })
    .from(learningEvidenceEmbeddings)
    .where(
      and(
        eq(learningEvidenceEmbeddings.organizationId, filters.organizationId),
        filters.topicId
          ? eq(learningEvidenceEmbeddings.topicId, filters.topicId)
          : undefined,
        filters.classroomStudentId
          ? eq(
              learningEvidenceEmbeddings.classroomStudentId,
              filters.classroomStudentId,
            )
          : undefined,
        filters.studentUserId
          ? eq(learningEvidenceEmbeddings.studentUserId, filters.studentUserId)
          : undefined,
        filters.sourceType
          ? inArray(learningEvidenceEmbeddings.sourceType, filters.sourceType)
          : undefined,
        filters.minDate
          ? gt(learningEvidenceEmbeddings.createdAt, filters.minDate)
          : undefined,
        filters.language
          ? eq(learningEvidenceEmbeddings.language, filters.language)
          : undefined,
        sql`${learningEvidenceEmbeddings.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${learningEvidenceEmbeddings.embedding} <=> ${queryVector} ASC`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    metadata: normalizeMetadata(row.metadata),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
    score: row.similarity,
  }));
}

async function fullTextSearchLearning(
  query: string,
  filters: LearningEvidenceSearchFilters,
  language: SupportedLanguage,
): Promise<LearningEvidenceSearchResult[]> {
  const limit = filters.limit ?? 20;
  const effectiveLanguage = filters.language ?? language;
  const tsConfig = langConfigMap[effectiveLanguage] ?? "english";
  const tsQuery = sql`websearch_to_tsquery(${tsConfig}, ${query})`;
  const rank =
    sql<number>`ts_rank(to_tsvector(${tsConfig}, ${learningEvidenceEmbeddings.content}), ${tsQuery})`;

  const rows = await getDb()
    .select({
      id: learningEvidenceEmbeddings.id,
      content: learningEvidenceEmbeddings.content,
      metadata: learningEvidenceEmbeddings.metadata,
      sourceType: learningEvidenceEmbeddings.sourceType,
      sourceId: learningEvidenceEmbeddings.sourceId,
      createdAt: learningEvidenceEmbeddings.createdAt,
      rank,
    })
    .from(learningEvidenceEmbeddings)
    .where(
      and(
        eq(learningEvidenceEmbeddings.organizationId, filters.organizationId),
        filters.topicId
          ? eq(learningEvidenceEmbeddings.topicId, filters.topicId)
          : undefined,
        filters.classroomStudentId
          ? eq(
              learningEvidenceEmbeddings.classroomStudentId,
              filters.classroomStudentId,
            )
          : undefined,
        filters.studentUserId
          ? eq(learningEvidenceEmbeddings.studentUserId, filters.studentUserId)
          : undefined,
        filters.sourceType
          ? inArray(learningEvidenceEmbeddings.sourceType, filters.sourceType)
          : undefined,
        filters.minDate
          ? gt(learningEvidenceEmbeddings.createdAt, filters.minDate)
          : undefined,
        filters.language
          ? eq(learningEvidenceEmbeddings.language, effectiveLanguage)
          : undefined,
        sql`to_tsvector(${tsConfig}, ${learningEvidenceEmbeddings.content}) @@ ${tsQuery}`,
      ),
    )
    .orderBy(desc(rank))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    metadata: normalizeMetadata(row.metadata),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
    score: row.rank,
  }));
}

async function expandLearningQueries(
  rawQuery: string,
  language: SupportedLanguage,
) {
  const queriesToRun = [rawQuery];

  try {
    const { output } = await generateText({
      model: flashLiteModel,
      output: Output.object({
        schema: z.object({
          hydeAnswer: z.string().optional(),
          variants: z.array(z.string()).default([]),
        }),
      }),
      prompt: `Original Query: "${rawQuery}"
Language: ${appLocaleLabels[language]}
Generate one hypothetical evidence-style answer and three alternate phrasings that would help retrieve grounded educational evidence.`,
    });

    if (output.hydeAnswer?.trim()) {
      queriesToRun.push(output.hydeAnswer.trim());
    }

    for (const variant of output.variants.slice(0, 3)) {
      if (variant.trim()) {
        queriesToRun.push(variant.trim());
      }
    }
  } catch {
    // Fall back to the raw query only.
  }

  return Array.from(new Set(queriesToRun));
}

export async function executeLearningEvidenceQuery(
  rawQuery: string,
  filters: LearningEvidenceSearchFilters,
  language: SupportedLanguage = "en",
) {
  const fetchLimit = filters.limit ?? 8;
  const queriesToRun = await expandLearningQueries(rawQuery, language);
  const k = 60;
  const scores = new Map<string, number>();
  const resultsMap = new Map<string, LearningEvidenceSearchResult>();

  const runBatch = async (batchFilters: LearningEvidenceSearchFilters) => {
    await Promise.all(
      queriesToRun.map(async (query) => {
        const [vectorResults, textResults] = await Promise.all([
          vectorSearchLearning(query, {
            ...batchFilters,
            limit: fetchLimit * 2,
          }),
          fullTextSearchLearning(query, {
            ...batchFilters,
            limit: fetchLimit * 2,
          }, language),
        ]);

        vectorResults.forEach((result, index) => {
          scores.set(result.id, (scores.get(result.id) ?? 0) + 1 / (k + index + 1));
          resultsMap.set(result.id, result);
        });

        textResults.forEach((result, index) => {
          scores.set(result.id, (scores.get(result.id) ?? 0) + 1 / (k + index + 1));
          if (!resultsMap.has(result.id)) {
            resultsMap.set(result.id, result);
          }
        });
      }),
    );
  };

  await runBatch({
    ...filters,
    language,
  });

  if (resultsMap.size < Math.max(3, fetchLimit)) {
    await runBatch({
      ...filters,
      language: undefined,
    });
  }

  const candidatePool = Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 150)
    .map(([id, score]) => {
      const result = resultsMap.get(id)!;
      return {
        ...result,
        score,
      };
    });

  const reranked = await rerank(
    rawQuery,
    candidatePool,
    fetchLimit,
    { organizationId: filters.organizationId },
  );

  return reranked.map((item) => ({
    ...item,
    metadata: normalizeMetadata(item.metadata),
    sourceType: item.sourceType as LearningEvidenceSourceType,
  })) as LearningEvidenceSearchResult[];
}

function buildReportEvidenceContent(params: {
  topicTitle: string;
  report: TeacherProgressReport;
  masteryPercent: number;
}) {
  return [
    `Topic: ${params.topicTitle}`,
    `Mastery: ${params.masteryPercent}%`,
    `Student summary: ${params.report.studentSummary}`,
    `Comparison to previous session: ${params.report.comparisonToPreviousSession}`,
    `Identified gaps: ${(params.report.identifiedGaps ?? []).join("; ") || "none"}`,
    `Recommended teacher actions: ${(params.report.recommendedTeacherActions ?? []).join("; ") || "none"}`,
    `Risk flags: ${(params.report.riskFlags ?? []).join("; ") || "none"}`,
    `Questions asked by student: ${(params.report.questionsAskedByStudent ?? []).map((item) => item.content).join("; ") || "none"}`,
    `Moment of understanding: ${params.report.momentOfUnderstanding ?? "none"}`,
  ].join("\n");
}

function buildInteractionEvidenceContent(params: {
  topicTitle?: string | null;
  role: string;
  interactionType: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}) {
  const metadataBits = [
    typeof params.metadata?.questionType === "string"
      ? `Question type: ${params.metadata.questionType}`
      : null,
    typeof params.metadata?.relevance === "string"
      ? `Relevance: ${params.metadata.relevance}`
      : null,
  ].filter(Boolean);

  return [
    `Topic: ${params.topicTitle ?? "General learning interaction"}`,
    `Role: ${params.role}`,
    `Interaction type: ${params.interactionType}`,
    `Content: ${params.content}`,
    ...metadataBits,
  ].join("\n");
}

function buildPatternEvidenceContent(params: {
  scopeType: "global" | "subject";
  subjectLabel?: string | null;
  teacherSummary: string;
  studentSummary: string;
  profile: StudentLearningPatternProfile;
}) {
  return [
    `Scope: ${params.scopeType === "global" ? "Cross-subject" : params.subjectLabel ?? "Subject-specific"}`,
    `Teacher summary: ${params.teacherSummary}`,
    `Student summary: ${params.studentSummary}`,
    `Engagement trend: ${params.profile.engagementTrend.direction}`,
    `Persistent misconceptions: ${params.profile.persistentMisconceptions.map((item) => item.label).join("; ") || "none"}`,
    `Engagement triggers: ${params.profile.motivationalPattern.engagementTriggers.join("; ") || "none"}`,
    `Disengagement triggers: ${params.profile.motivationalPattern.disengagementTriggers.join("; ") || "none"}`,
    `Explanation approaches: ${params.profile.explanationApproaches.map((item) => `${item.type} (${Math.round(item.successRate * 100)}%)`).join("; ") || "none"}`,
  ].join("\n");
}

export async function indexLearningMaterialEvidence(params: {
  organizationId: string;
  topicId: string;
  materialId: string;
  title: string;
  description?: string | null;
  mimeType: string;
  content: string;
  language?: SupportedLanguage | string | null;
}) {
  return await replaceLearningEvidenceSource({
    organizationId: params.organizationId,
    topicId: params.topicId,
    sourceType: "material",
    sourceId: params.materialId,
    language: params.language,
    metadata: {
      title: params.title,
      description: params.description ?? "",
      mimeType: params.mimeType,
    },
    content: `Material title: ${params.title}
Description: ${params.description ?? "none"}
${params.content}`.trim(),
  });
}

export async function indexLearningInteractionEvidence(params: {
  organizationId: string;
  topicId?: string | null;
  classroomStudentId: string;
  studentUserId?: string | null;
  interactionId: string;
  topicTitle?: string | null;
  language?: SupportedLanguage | string | null;
  role: string;
  interactionType: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}) {
  return await replaceLearningEvidenceSource({
    organizationId: params.organizationId,
    topicId: params.topicId ?? null,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    sourceType: "interaction",
    sourceId: params.interactionId,
    language: params.language,
    metadata: {
      title: params.topicTitle ?? params.interactionType,
      interactionType: params.interactionType,
      role: params.role,
      ...(params.metadata ?? {}),
    },
    content: buildInteractionEvidenceContent({
      topicTitle: params.topicTitle,
      role: params.role,
      interactionType: params.interactionType,
      content: params.content,
      metadata: params.metadata,
    }),
  });
}

export async function indexLearningReportEvidence(params: {
  organizationId: string;
  topicId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  reportId: string;
  topicTitle: string;
  masteryPercent: number;
  report: TeacherProgressReport;
  language?: SupportedLanguage | string | null;
}) {
  return await replaceLearningEvidenceSource({
    organizationId: params.organizationId,
    topicId: params.topicId,
    classroomStudentId: params.classroomStudentId,
    studentUserId: params.studentUserId ?? null,
    sourceType: "report",
    sourceId: params.reportId,
    language: params.language,
    metadata: {
      title: params.topicTitle,
      masteryPercent: params.masteryPercent,
      riskFlags: params.report.riskFlags ?? [],
      identifiedGaps: params.report.identifiedGaps ?? [],
    },
    content: buildReportEvidenceContent({
      topicTitle: params.topicTitle,
      report: params.report,
      masteryPercent: params.masteryPercent,
    }),
  });
}

export async function indexLearningPatternEvidence(params: {
  organizationId: string;
  studentUserId: string;
  profileId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  scopeType: "global" | "subject";
  summaryLocale?: SupportedLanguage | string | null;
  teacherSummary: string;
  studentSummary: string;
  profile: StudentLearningPatternProfile;
}) {
  return await replaceLearningEvidenceSource({
    organizationId: params.organizationId,
    studentUserId: params.studentUserId,
    sourceType: "pattern",
    sourceId: params.profileId,
    language: params.summaryLocale,
    metadata: {
      title:
        params.scopeType === "global"
          ? "Cross-subject learning pattern"
          : params.subjectLabel ?? params.subjectKey ?? "Subject learning pattern",
      scopeType: params.scopeType,
      subjectKey: params.subjectKey ?? null,
      subjectLabel: params.subjectLabel ?? null,
      confidence: params.profile.patternConfidence,
    },
    content: buildPatternEvidenceContent({
      scopeType: params.scopeType,
      subjectLabel: params.subjectLabel,
      teacherSummary: params.teacherSummary,
      studentSummary: params.studentSummary,
      profile: params.profile,
    }),
  });
}

const teacherAnswerSchema = z.object({
  response: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});

export async function answerTeacherStudentQuestion(params: {
  organizationId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
  studentName: string;
  question: string;
  language?: SupportedLanguage;
}) {
  const requestedLanguage = normalizeAppLocale(params.language ?? "en");
  const retrieved = await executeLearningEvidenceQuery(
    params.question,
    {
      organizationId: params.organizationId,
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId ?? undefined,
      sourceType: ["report", "interaction", "pattern", "material"],
      limit: 8,
      language: requestedLanguage,
    },
    requestedLanguage,
  );

  const mem0Results =
    isMem0Configured() && params.studentUserId
      ? await searchLearningPatternMemories({
          studentUserId: params.studentUserId,
          query: params.question,
          limit: 4,
        }).catch(() => [])
      : [];

  if (retrieved.length === 0 && mem0Results.length === 0) {
    return {
      response:
        requestedLanguage === "fr"
          ? `Je n'ai pas assez de preuves fiables sur ${params.studentName} pour répondre correctement.`
          : requestedLanguage === "de"
            ? `Ich habe nicht genug verlässliche Belege zu ${params.studentName}, um sicher zu antworten.`
            : requestedLanguage === "es"
              ? `No tengo evidencia suficiente y fiable sobre ${params.studentName} para responder con seguridad.`
              : requestedLanguage === "it"
                ? `Non ho prove sufficienti e affidabili su ${params.studentName} per rispondere con sicurezza.`
                : `I do not have enough reliable evidence about ${params.studentName} to answer that safely.`,
      confidence: "low" as const,
      sources: [],
    };
  }

  const evidenceContext = retrieved
    .slice(0, 6)
    .map((item) => {
      const label = buildLearningSourceLabel(item);
      return `- ${label} [${item.id}]
${item.content}`;
    })
    .join("\n\n");

  const memoryContext = mem0Results
    .slice(0, 3)
    .map((item, index) => `- Memory ${index + 1}: ${item.memory ?? ""}`)
    .join("\n");

  const systemPrompt = `You are a teacher-facing learning analyst.

Answer the teacher's question about one student using only grounded evidence.
Write the answer in ${appLocaleLabels[requestedLanguage]}.

Rules:
- Prefer retrieved report, interaction, pattern, and material evidence.
- Treat memory notes as weak secondary context, never as the sole basis for a strong claim.
- If the evidence is incomplete, say that clearly.
- Do not guess, diagnose, or infer hidden causes.
- Cite source ids in the response when you rely on them.
- Keep the answer practical for a teacher.

Return JSON only with:
{"response":"string","confidence":"high|medium|low","sources":[{"id":"string","label":"string"}]}`;

  const raw = await generateAIResponse(
    `<student>${params.studentName}</student>
<question>${params.question}</question>

<retrieved-evidence>
${evidenceContext || "None"}
</retrieved-evidence>

<memory-notes>
${memoryContext || "None"}
</memory-notes>`,
    systemPrompt,
    {
      organizationId: params.organizationId,
      promptCache: {
        namespace: "teacher-student-chat-answer",
        staticSystemPrompt: systemPrompt,
      },
    },
  );

  const parsed = teacherAnswerSchema.safeParse(
    (() => {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    })(),
  );

  if (parsed.success) {
    const selectedSources = parsed.data.sources.length
      ? parsed.data.sources
      : retrieved.slice(0, 4).map((item) => ({
          id: item.id,
          label: buildLearningSourceLabel(item),
        }));

    return {
      response: parsed.data.response,
      confidence: parsed.data.confidence,
      sources: selectedSources,
    };
  }

  return {
    response:
      `I found some relevant evidence, but I could not produce a reliable grounded answer yet. Review these sources: ${retrieved
        .slice(0, 4)
        .map((item) => `${buildLearningSourceLabel(item)} (${item.id})`)
        .join(", ")}.`,
    confidence: "low" as const,
    sources: retrieved.slice(0, 4).map((item) => ({
      id: item.id,
      label: buildLearningSourceLabel(item),
    })),
  };
}

export async function ensureLearningTopicMaterialEvidence(params: {
  organizationId: string;
  topicId: string;
}) {
  const [existing, topic] = await Promise.all([
    getDb()
      .select({ sourceId: learningEvidenceEmbeddings.sourceId })
      .from(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.organizationId, params.organizationId),
          eq(learningEvidenceEmbeddings.topicId, params.topicId),
          eq(learningEvidenceEmbeddings.sourceType, "material"),
        ),
      )
      .limit(1),
    getDb().query.learningTopics.findFirst({
      where: eq(learningTopics.id, params.topicId),
      with: {
        materials: true,
      },
      }),
  ]);

  if (!topic) {
    return;
  }

  const indexedMaterialIds = new Set(existing.map((row) => row.sourceId));
  const materialsToIndex = topic.materials.filter(
    (material) =>
      material.extractedText?.trim() &&
      !indexedMaterialIds.has(material.id),
  );

  if (materialsToIndex.length === 0) {
    return;
  }

  await Promise.all(
    materialsToIndex.map((material) =>
      indexLearningMaterialEvidence({
        organizationId: params.organizationId,
        topicId: params.topicId,
        materialId: material.id,
        title: material.title,
        description: material.description,
        mimeType: material.mimeType,
        content: material.extractedText ?? "",
        language: topic.contentLocale,
      }),
    ),
  );
}

export async function hydrateStudentLearningEvidence(params: {
  organizationId: string;
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, params.classroomStudentId),
    with: {
      classroom: true,
    },
  });

  if (!membership) return;

  const [reports, interactions, profiles] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
      with: {
        topic: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 24,
    }),
    getDb().query.learningInteractions.findMany({
      where: eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      with: {
        topic: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 80,
    }),
    params.studentUserId
      ? getDb().query.studentLearningPatternProfiles.findMany({
          where: and(
            eq(studentLearningPatternProfiles.organizationId, params.organizationId),
            eq(studentLearningPatternProfiles.studentUserId, params.studentUserId),
          ),
        })
      : Promise.resolve([]),
  ]);

  const topicIds = Array.from(
    new Set(
      [
        ...reports.map((report) => report.topicId),
        ...interactions
          .map((interaction) => interaction.topicId)
          .filter((value): value is string => Boolean(value)),
      ],
    ),
  );

  await Promise.all(
    topicIds.map((topicId) =>
      ensureLearningTopicMaterialEvidence({
        organizationId: params.organizationId,
        topicId,
      }),
    ),
  );

  await Promise.all([
    ...reports.map((report) =>
      indexLearningReportEvidence({
        organizationId: params.organizationId,
        topicId: report.topicId,
        classroomStudentId: params.classroomStudentId,
        studentUserId: membership.userId ?? null,
        reportId: report.id,
        topicTitle: report.topic?.title ?? "Topic",
        masteryPercent: report.masteryPercent,
        report: report.report,
        language: report.sourceLocale,
      }),
    ),
    ...interactions.map((interaction) =>
      indexLearningInteractionEvidence({
        organizationId: params.organizationId,
        topicId: interaction.topicId ?? null,
        classroomStudentId: params.classroomStudentId,
        studentUserId: membership.userId ?? null,
        interactionId: interaction.id,
        topicTitle: interaction.topic?.title ?? null,
        language:
          interaction.topic?.contentLocale ??
          membership.classroom.defaultContentLocale,
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
        metadata: interaction.metadata as Record<string, unknown> | null,
      }),
    ),
    ...profiles.map((profile) =>
      indexLearningPatternEvidence({
        organizationId: params.organizationId,
        studentUserId: profile.studentUserId,
        profileId: profile.id,
        subjectKey: profile.subjectKey ?? null,
        subjectLabel: profile.subjectLabel ?? null,
        scopeType: profile.scopeType as "global" | "subject",
        summaryLocale: profile.summaryLocale,
        teacherSummary: profile.teacherSummary,
        studentSummary: profile.studentSummary,
        profile: profile.profile,
      }),
    ),
  ]);
}

export async function findLearningEvidenceContext(params: {
  organizationId: string;
  topicId: string;
  query: string;
  language?: SupportedLanguage;
  limit?: number;
}) {
  await ensureLearningTopicMaterialEvidence({
    organizationId: params.organizationId,
    topicId: params.topicId,
  });

  return await executeLearningEvidenceQuery(
    params.query,
    {
      organizationId: params.organizationId,
      topicId: params.topicId,
      sourceType: ["material"],
      limit: params.limit ?? 6,
      language: params.language,
    },
    params.language ?? "en",
  );
}

export async function syncLearningInteractionEvidence(interactionId: string) {
  const interaction = await getDb().query.learningInteractions.findFirst({
    where: eq(learningInteractions.id, interactionId),
  });

  if (!interaction) return null;

  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, interaction.classroomStudentId),
    with: {
      classroom: true,
    },
  });

  if (!membership) return null;

  const topic = interaction.topicId
    ? await getDb().query.learningTopics.findFirst({
        where: eq(learningTopics.id, interaction.topicId),
      })
    : null;

  return await indexLearningInteractionEvidence({
    organizationId: membership.classroom.organizationId,
    topicId: interaction.topicId,
    classroomStudentId: interaction.classroomStudentId,
    studentUserId: membership.userId,
    interactionId: interaction.id,
    topicTitle: topic?.title ?? null,
    language: topic?.contentLocale ?? membership.classroom.defaultContentLocale,
    role: interaction.role,
    interactionType: interaction.interactionType,
    content: interaction.content,
    metadata: interaction.metadata as Record<string, unknown> | null,
  });
}
