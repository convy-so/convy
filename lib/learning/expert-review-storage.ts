import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertCrystallizations,
  expertReviewCases,
} from "@/db/schema";
import { generateBatchEmbeddings } from "@/lib/rag/embeddings";

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

  return created;
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
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function maybeCreateDraftCrystallizationFromReviewCases(params: {
  topicId: string;
  reviewType: string;
  relevanceScope: "general" | "framework_specific";
  frameworkId?: string | null;
}) {
  const cutoffDate = new Date(Date.now() - CRYSTALLIZATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const reusableCases = await getDb().query.expertReviewCases.findMany({
    where: and(
      eq(expertReviewCases.topicId, params.topicId),
      eq(expertReviewCases.status, "open"),
      eq(expertReviewCases.reusableSignal, true),
      eq(expertReviewCases.reviewType, params.reviewType),
      eq(expertReviewCases.relevanceScope, params.relevanceScope),
      gte(expertReviewCases.createdAt, cutoffDate),
      params.relevanceScope === "framework_specific"
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
    const candidate = reusableCases[i];
    const candidateTriggerEmbedding = triggerEmbeddings[i] ?? [];
    const candidateActionEmbedding = actionEmbeddings[i] ?? [];

    let isNearDuplicate = false;
    for (let j = 0; j < semanticallyDiverseCases.length; j++) {
      const triggerSimilarity = cosineSimilarity(diverseTriggerEmbeddings[j], candidateTriggerEmbedding);
      const actionSimilarity = cosineSimilarity(diverseActionEmbeddings[j], candidateActionEmbedding);
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
        eq(expertReviewCases.status, "open"),
      ),
    });

    if (openCases.length < semanticallyDiverseCases.length) {
      return { created: false as const, reason: "concurrency_conflict" as const };
    }

    const duplicateDraft = await tx.query.expertCrystallizations.findFirst({
      where: and(
        eq(expertCrystallizations.topicId, params.topicId),
        eq(expertCrystallizations.status, "draft"),
        eq(expertCrystallizations.relevanceScope, params.relevanceScope),
        params.relevanceScope === "framework_specific"
          ? eq(expertCrystallizations.frameworkId, params.frameworkId ?? "")
          : undefined,
        sql`${expertCrystallizations.sourceReviewCaseIds} @> ${JSON.stringify(sourceReviewCaseIds)}::jsonb`,
      ),
    });

    if (duplicateDraft) {
      return { created: false as const, reason: "duplicate_draft" as const };
    }

    const exemplar = semanticallyDiverseCases[0];
    const [draft] = await tx
      .insert(expertCrystallizations)
      .values({
        id: nanoid(),
        topicId: params.topicId,
        frameworkId: params.relevanceScope === "framework_specific" ? (params.frameworkId ?? null) : null,
        status: "draft",
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

    await tx
      .update(expertReviewCases)
      .set({
        status: "crystallized",
        updatedAt: new Date(),
      })
      .where(inArray(expertReviewCases.id, sourceReviewCaseIds));

    return { created: true as const, draftId: draft.id, sourceReviewCaseIds };
  });
}
export async function listExpertReviewQueue() {
  const reviewCases = await getDb().query.expertReviewCases.findMany({
    where: and(
      eq(expertReviewCases.status, "open"),
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
