import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertCrystallizations,
  expertReviewCases,
} from "@/db/schema";

export async function listExpertReviewCases(params: {
  teacherUserId: string;
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

  return reviewCases.filter((reviewCase) => {
    const ownerId =
      reviewCase.topic?.classroom.teacherUserId ??
      reviewCase.classroomStudent?.classroom.teacherUserId ??
      reviewCase.session?.topic?.classroom.teacherUserId ??
      null;
    return ownerId === params.teacherUserId;
  });
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
const SEMANTIC_DEDUP_SIMILARITY_THRESHOLD = 0.8;

function normalizeSemanticText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeSemanticText(left));
  const rightTokens = new Set(normalizeSemanticText(right));
  if (!leftTokens.size && !rightTokens.size) return 1;
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

export async function maybeCreateDraftCrystallizationFromReviewCases(params: {
  topicId: string;
  reviewType: string;
  relevanceScope: "general" | "framework_specific";
  frameworkVersionId?: string | null;
}) {
  return await getDb().transaction(async (tx) => {
    const cutoffDate = new Date(Date.now() - CRYSTALLIZATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const reusableCases = await tx.query.expertReviewCases.findMany({
      where: and(
        eq(expertReviewCases.topicId, params.topicId),
        eq(expertReviewCases.status, "open"),
        eq(expertReviewCases.reusableSignal, true),
        eq(expertReviewCases.reviewType, params.reviewType),
        eq(expertReviewCases.relevanceScope, params.relevanceScope),
        gte(expertReviewCases.createdAt, cutoffDate),
        params.relevanceScope === "framework_specific"
          ? eq(expertReviewCases.frameworkVersionId, params.frameworkVersionId ?? "")
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

    const semanticallyDiverseCases: typeof reusableCases = [];
    for (const candidate of reusableCases) {
      const isNearDuplicate = semanticallyDiverseCases.some((existing) => {
        const triggerSimilarity = jaccardSimilarity(existing.tutorFailureSummary, candidate.tutorFailureSummary);
        const actionSimilarity = jaccardSimilarity(existing.expertCorrection, candidate.expertCorrection);
        return (
          triggerSimilarity >= SEMANTIC_DEDUP_SIMILARITY_THRESHOLD
          && actionSimilarity >= SEMANTIC_DEDUP_SIMILARITY_THRESHOLD
        );
      });
      if (!isNearDuplicate) semanticallyDiverseCases.push(candidate);
      if (semanticallyDiverseCases.length >= CRYSTALLIZATION_MIN_REUSABLE_CASES) break;
    }

    if (semanticallyDiverseCases.length < CRYSTALLIZATION_MIN_REUSABLE_CASES) {
      return { created: false as const, reason: "insufficient_semantic_diversity" as const };
    }

    const sourceReviewCaseIds = semanticallyDiverseCases.map((item) => item.id);
    const duplicateDraft = await tx.query.expertCrystallizations.findFirst({
      where: and(
        eq(expertCrystallizations.topicId, params.topicId),
        eq(expertCrystallizations.status, "draft"),
        eq(expertCrystallizations.relevanceScope, params.relevanceScope),
        params.relevanceScope === "framework_specific"
          ? eq(expertCrystallizations.frameworkVersionId, params.frameworkVersionId ?? "")
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
        frameworkVersionId: params.relevanceScope === "framework_specific" ? (params.frameworkVersionId ?? null) : null,
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
          tags: [params.reviewType, "expert-review-derived"],
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

export async function listExpertReviewQueue(params: { teacherUserId: string }) {
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

  return reviewCases
    .filter((reviewCase) => {
      const ownerId =
        reviewCase.topic?.classroom.teacherUserId ??
        reviewCase.classroomStudent?.classroom.teacherUserId ??
        reviewCase.session?.topic?.classroom.teacherUserId ??
        null;
      return ownerId === params.teacherUserId;
    })
    .map((reviewCase) => ({
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
