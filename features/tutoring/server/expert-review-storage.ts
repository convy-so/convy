import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  expertCrystallizations,
  expertReviewCases,
} from "@/shared/db/schema";
import {
  EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES,
  LEARNING_STATUS,
} from "@/shared/learning/constants";
import { generateBatchEmbeddings } from "@/shared/retrieval/embeddings";
import { requireValue } from "@/shared/utils/collections";

export async function listExpertReviewCases(params: {
  topicId?: string | null;
  sessionId?: string | null;
}) {
  const reviewCases = await getDb().query.expertReviewCases.findMany({
    where: and(
      params.topicId ? eq(expertReviewCases.topicId, params.topicId) : undefined,
      params.sessionId ? eq(expertReviewCases.sessionId, params.sessionId) : undefined,
    ),
    with: {
      topic: {
        with: {
          classroom: true,
        },
      },
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
      session: {
        with: {
          topic: {
            with: {
              classroom: true,
            },
          },
        },
      },
    },
    orderBy: [desc(expertReviewCases.updatedAt)],
  });

  return reviewCases;
}

export async function createExpertReviewCase(params: {
  reviewCase: typeof expertReviewCases.$inferInsert;
}) {
  const [created] = await getDb()
    .insert(expertReviewCases)
    .values(params.reviewCase)
    .returning();

  return requireValue(
    created,
    `Failed to create expert review case for topic ${params.reviewCase.topicId}`,
  );
}

const CRYSTALLIZATION_MIN_REUSABLE_CASES = 3;
const CRYSTALLIZATION_WINDOW_DAYS = 30;
const CRYSTALLIZATION_MIN_DIVERSITY_SESSIONS = 2;
const SEMANTIC_DEDUP_SIMILARITY_THRESHOLD = 0.85;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;
    dotProduct += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function maybeCreateDraftCrystallizationFromReviewCases(params: {
  topicId: string;
  reviewType: string;
  relevanceScope: (typeof EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES)[number];
  frameworkId?: string | null;
}) {
  const cutoffDate = new Date(Date.now() - CRYSTALLIZATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const reusableCases = await getDb().query.expertReviewCases.findMany({
    where: and(
      eq(expertReviewCases.topicId, params.topicId),
      eq(expertReviewCases.status, LEARNING_STATUS.reviewCaseOpen),
      eq(expertReviewCases.reusableSignal, true),
      eq(expertReviewCases.reviewType, params.reviewType),
      eq(expertReviewCases.relevanceScope, params.relevanceScope),
      gte(expertReviewCases.createdAt, cutoffDate),
      params.relevanceScope === LEARNING_STATUS.relevanceFrameworkSpecific
        ? eq(expertReviewCases.frameworkId, params.frameworkId ?? "")
        : undefined,
    ),
    orderBy: [desc(expertReviewCases.createdAt)],
    limit: 12,
  });

  if (reusableCases.length < CRYSTALLIZATION_MIN_REUSABLE_CASES) {
    return { created: false as const, reason: "insufficient_reusable_cases" as const };
  }

  const uniqueSessionIds = new Set(reusableCases.map((item) => item.sessionId).filter(Boolean));
  if (uniqueSessionIds.size < CRYSTALLIZATION_MIN_DIVERSITY_SESSIONS) {
    return { created: false as const, reason: "insufficient_diversity" as const };
  }

  const triggers = reusableCases.map((c) => c.tutorFailureSummary);
  const actions = reusableCases.map((c) => c.expertCorrection);

  // Generate embeddings outside of the transaction block to avoid blocking DB connection pool
  const [triggerEmbeddings, actionEmbeddings] = await Promise.all([
    generateBatchEmbeddings(triggers, { feature: "expert-review-dedup" }),
    generateBatchEmbeddings(actions, { feature: "expert-review-dedup" }),
  ]);

  const semanticallyDiverseCases: typeof reusableCases = [];
  const diverseTriggerEmbeddings: number[][] = [];
  const diverseActionEmbeddings: number[][] = [];

  for (let i = 0; i < reusableCases.length; i++) {
    const candidate = requireValue(
      reusableCases[i],
      `Expected reusable expert review case at index ${i}`,
    );
    const candidateTriggerEmbedding = triggerEmbeddings[i] ?? [];
    const candidateActionEmbedding = actionEmbeddings[i] ?? [];

    let isNearDuplicate = false;
    for (let j = 0; j < semanticallyDiverseCases.length; j++) {
      const triggerSimilarity = cosineSimilarity(
        requireValue(
          diverseTriggerEmbeddings[j],
          `Expected trigger embedding at index ${j}`,
        ),
        candidateTriggerEmbedding,
      );
      const actionSimilarity = cosineSimilarity(
        requireValue(
          diverseActionEmbeddings[j],
          `Expected action embedding at index ${j}`,
        ),
        candidateActionEmbedding,
      );
      if (
        triggerSimilarity >= SEMANTIC_DEDUP_SIMILARITY_THRESHOLD &&
        actionSimilarity >= SEMANTIC_DEDUP_SIMILARITY_THRESHOLD
      ) {
        isNearDuplicate = true;
        break;
      }
    }

    if (!isNearDuplicate) {
      semanticallyDiverseCases.push(candidate);
      diverseTriggerEmbeddings.push(candidateTriggerEmbedding);
      diverseActionEmbeddings.push(candidateActionEmbedding);
    }

    if (semanticallyDiverseCases.length >= CRYSTALLIZATION_MIN_REUSABLE_CASES) {
      break;
    }
  }

  if (semanticallyDiverseCases.length < CRYSTALLIZATION_MIN_REUSABLE_CASES) {
    return { created: false as const, reason: "insufficient_semantic_diversity" as const };
  }

  const sourceReviewCaseIds = semanticallyDiverseCases.map((item) => item.id);
  const frameworkPolicyTags = Array.from(
    new Set(
      semanticallyDiverseCases.flatMap((item) => {
        const rawTags = item.metadata?.frameworkPolicyTags;
        return Array.isArray(rawTags)
          ? rawTags.filter((tag): tag is string => typeof tag === "string")
          : [];
      }),
    ),
  );

  return await getDb().transaction(async (tx) => {
    // Confirm status is still open inside transaction block
    const openCases = await tx.query.expertReviewCases.findMany({
      where: and(
        inArray(expertReviewCases.id, sourceReviewCaseIds),
        eq(expertReviewCases.status, LEARNING_STATUS.reviewCaseOpen),
      ),
    });

    if (openCases.length < semanticallyDiverseCases.length) {
      return { created: false as const, reason: "concurrency_conflict" as const };
    }

    const duplicateDraft = await tx.query.expertCrystallizations.findFirst({
      where: and(
        eq(expertCrystallizations.topicId, params.topicId),
        eq(expertCrystallizations.status, LEARNING_STATUS.crystallizationDraft),
        eq(expertCrystallizations.relevanceScope, params.relevanceScope),
        params.relevanceScope === LEARNING_STATUS.relevanceFrameworkSpecific
          ? eq(expertCrystallizations.frameworkId, params.frameworkId ?? "")
          : undefined,
        sql`${expertCrystallizations.sourceReviewCaseIds} @> ${JSON.stringify(sourceReviewCaseIds)}::jsonb`,
      ),
    });

    if (duplicateDraft) {
      return { created: false as const, reason: "duplicate_draft" as const };
    }

    const exemplar = requireValue(
      semanticallyDiverseCases[0],
      "Expected an exemplar expert review case when creating crystallization",
    );
    const [draft] = await tx
      .insert(expertCrystallizations)
      .values({
        id: nanoid(),
        topicId: params.topicId,
        frameworkId:
          params.relevanceScope === LEARNING_STATUS.relevanceFrameworkSpecific
            ? (params.frameworkId ?? null)
            : null,
        status: LEARNING_STATUS.crystallizationDraft,
        relevanceScope: params.relevanceScope,
        title: `${params.reviewType}: reuse pattern from expert review cases`,
        heuristic: {
          id: nanoid(),
          title: `${params.reviewType}: reuse pattern`,
          trigger: exemplar.tutorFailureSummary,
          action: exemplar.expertCorrection,
          rationale: `Synthesized from ${semanticallyDiverseCases.length} reusable expert review cases within ${CRYSTALLIZATION_WINDOW_DAYS} days.`,
          examples: semanticallyDiverseCases.map((item) => item.expertCorrection).slice(0, 3),
          priority: exemplar.priority === "high" ? "high" : "medium",
          tags: [
            params.reviewType,
            "expert-review-derived",
            ...frameworkPolicyTags,
          ],
          relevanceScope: params.relevanceScope,
        },
        sourceReviewCaseIds,
        notes: "Auto-created draft from repeated reusable expert review cases. Requires expert approval.",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    const createdDraft = requireValue(
      draft,
      `Failed to create expert crystallization draft for topic ${params.topicId}`,
    );

    await tx
      .update(expertReviewCases)
      .set({
        status: LEARNING_STATUS.reviewCaseCrystallized,
        updatedAt: new Date(),
      })
      .where(inArray(expertReviewCases.id, sourceReviewCaseIds));

    return {
      created: true as const,
      draftId: createdDraft.id,
      sourceReviewCaseIds,
    };
  });
}
export async function listExpertReviewQueue() {
  const reviewCases = await getDb().query.expertReviewCases.findMany({
    where: and(
      eq(expertReviewCases.status, LEARNING_STATUS.reviewCaseOpen),
    ),
    with: {
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
      topic: {
        with: {
          classroom: true,
        },
      },
      session: {
        with: {
          topic: {
            with: {
              classroom: true,
            },
          },
        },
      },
    },
    orderBy: [desc(expertReviewCases.createdAt)],
  });

  return reviewCases.map((reviewCase) => ({
    key: reviewCase.id,
    sessionId: reviewCase.sessionId,
    topicId: reviewCase.topicId,
    classroomStudentId: reviewCase.classroomStudentId,
    studentName: reviewCase.classroomStudent?.fullName ?? null,
    topicTitle: reviewCase.topic?.title ?? null,
    priority: reviewCase.priority as "low" | "medium" | "high",
    reasons: [
      reviewCase.reviewType,
      reviewCase.tutorFailureSummary,
    ].filter(Boolean),
    createdAt: reviewCase.createdAt.toISOString(),
    }));
}
