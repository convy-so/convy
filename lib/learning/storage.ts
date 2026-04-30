import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  classroomStudents,
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
  expertReviewCases,
  expertRuntimeModels,
  learningInteractions,
  learningMessages,
  learningSessions,
  learningTopics,
  studentInterestProfiles,
  studentModelAnalyses,
  studentModels,
  studentModelSnapshots,
  studentProgressReports,
  topicMaterials,
} from "@/db/schema";
import { createDefaultDeepFramework } from "@/lib/learning/framework-packages";
import type {
  ExpertTutorRuntimeModel,
  LearningInteractionType,
  LearningSessionState,
  StudentInterestProfile,
  StudentModelSnapshot,
  TeacherProgressReport,
} from "@/lib/learning/types";
import {
  createDefaultLearningSessionState,
  expertTutorRuntimeModelSchema,
  studentModelSnapshotSchema,
} from "@/lib/learning/types";

export async function getTopicWithMaterials(topicId: string) {
  return await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    with: {
      classroom: true,
      materials: {
        orderBy: [asc(topicMaterials.createdAt)],
      },
    },
  });
}

export async function createLearningSession(params: {
  topicId?: string | null;
  classroomStudentId: string;
  sessionType: string;
  sessionLocale?: string | null;
  state?: LearningSessionState;
}) {
  const [session] = await getDb()
    .insert(learningSessions)
    .values({
      id: nanoid(),
      topicId: params.topicId ?? null,
      classroomStudentId: params.classroomStudentId,
      sessionType: params.sessionType,
      sessionLocale: params.sessionLocale ?? "en",
      sessionStatus: "active",
      stateVersion: 1,
      state: params.state ?? createDefaultLearningSessionState(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return session;
}

export async function getLearningSessionById(sessionId: string) {
  return await getDb().query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

export async function updateLearningSessionState(params: {
  sessionId: string;
  state: LearningSessionState;
  sessionStatus?: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const completedAt =
    params.sessionStatus === "completed"
      ? new Date()
      : params.sessionStatus && params.sessionStatus !== "completed"
        ? null
        : undefined;

  const [session] = await getDb()
    .update(learningSessions)
    .set({
      state: params.state,
      sessionStatus: params.sessionStatus,
      summary: params.summary,
      completedAt,
      stateVersion:
        params.expectedStateVersion !== undefined
          ? params.expectedStateVersion + 1
          : sql`${learningSessions.stateVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, params.sessionId),
        params.expectedStateVersion !== undefined
          ? eq(learningSessions.stateVersion, params.expectedStateVersion)
          : undefined,
      ),
    )
    .returning();

  if (!session) {
    throw new Error("Learning session state update conflict.");
  }

  return session;
}

export async function completeLearningSession(params: {
  sessionId: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const session = await getLearningSessionById(params.sessionId);
  if (!session) {
    throw new Error("Learning session not found.");
  }

  const state = {
    ...(session.state ?? createDefaultLearningSessionState()),
    completed: true,
    reportReady:
      (session.state ?? createDefaultLearningSessionState()).reportReady ?? false,
  } as LearningSessionState;

  return await updateLearningSessionState({
    sessionId: params.sessionId,
    state,
    sessionStatus: "completed",
    summary: params.summary ?? session.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });
}

export async function getActiveLearningSession(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionType: string;
  sessionLocale?: string | null;
}) {
  return await getDb().query.learningSessions.findFirst({
    where:
      params.topicId == null
        ? and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            isNull(learningSessions.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(learningSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(learningSessions.sessionStatus, "active"),
          )
        : and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            eq(learningSessions.topicId, params.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(learningSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(learningSessions.sessionStatus, "active"),
          ),
    orderBy: [desc(learningSessions.createdAt)],
  });
}

export async function getLatestCompletedLearningSession(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionType: string;
}) {
  return await getDb().query.learningSessions.findFirst({
    where:
      params.topicId == null
        ? and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            isNull(learningSessions.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            eq(learningSessions.sessionStatus, "completed"),
          )
        : and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            eq(learningSessions.topicId, params.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            eq(learningSessions.sessionStatus, "completed"),
          ),
    orderBy: [desc(learningSessions.completedAt), desc(learningSessions.createdAt)],
  });
}

export async function listLearningMessages(sessionId: string) {
  return await getDb().query.learningMessages.findMany({
    where: eq(learningMessages.sessionId, sessionId),
    orderBy: [asc(learningMessages.createdAt)],
  });
}

export async function appendLearningMessage(params: {
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const [message] = await getDb()
    .insert(learningMessages)
    .values({
      id: nanoid(),
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(learningSessions)
    .set({ updatedAt: new Date() })
    .where(eq(learningSessions.id, params.sessionId));

  return message;
}

export async function listLearningInteractions(params: {
  classroomStudentId: string;
  sessionId?: string | null;
}) {
  return await getDb().query.learningInteractions.findMany({
    where: and(
      eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      params.sessionId ? eq(learningInteractions.sessionId, params.sessionId) : undefined,
    ),
    orderBy: [asc(learningInteractions.createdAt)],
  });
}

export async function logLearningInteraction(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionId?: string | null;
  role: string;
  interactionType: LearningInteractionType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const [interaction] = await getDb()
    .insert(learningInteractions)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      topicId: params.topicId ?? null,
      sessionId: params.sessionId ?? null,
      role: params.role,
      interactionType: params.interactionType,
      content: params.content,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return interaction;
}

export async function createStudentProgressReport(params: {
  topicId: string;
  classroomStudentId: string;
  generatedFromSessionId?: string | null;
  masteryPercent: number;
  sourceLocale?: string | null;
  report: TeacherProgressReport;
}) {
  const [report] = await getDb()
    .insert(studentProgressReports)
    .values({
      id: nanoid(),
      topicId: params.topicId,
      classroomStudentId: params.classroomStudentId,
      generatedFromSessionId: params.generatedFromSessionId ?? null,
      masteryPercent: params.masteryPercent,
      sourceLocale: params.sourceLocale ?? "en",
      report: params.report,
      visibility: "teacher_only",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return report;
}

export async function getLatestStudentProgressReport(params: {
  topicId: string;
  classroomStudentId: string;
}) {
  return await getDb().query.studentProgressReports.findFirst({
    where: and(
      eq(studentProgressReports.topicId, params.topicId),
      eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
    ),
    orderBy: [desc(studentProgressReports.createdAt)],
  });
}

export async function upsertInterestProfile(params: {
  classroomStudentId: string;
  profile: StudentInterestProfile;
}) {
  const existing = await getDb().query.studentInterestProfiles.findFirst({
    where: eq(studentInterestProfiles.classroomStudentId, params.classroomStudentId),
  });

  if (existing) {
    const [updated] = await getDb()
      .update(studentInterestProfiles)
      .set({
        profile: params.profile,
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(studentInterestProfiles.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await getDb()
    .insert(studentInterestProfiles)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      profile: params.profile,
      visibility: "private_to_student_and_agent",
      lastRefreshedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function markStudentOnboardingComplete(classroomStudentId: string) {
  const [updated] = await getDb()
    .update(classroomStudents)
    .set({
      onboardingStatus: "complete",
      updatedAt: new Date(),
    })
    .where(eq(classroomStudents.id, classroomStudentId))
    .returning();

  return updated;
}

export async function ensureStudentModel(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const existing = await getDb().query.studentModels.findFirst({
    where: eq(studentModels.classroomStudentId, params.classroomStudentId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await getDb()
    .insert(studentModels)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      summary: "",
      anomalyStatus: "clear",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function getStudentModelByClassroomStudentId(classroomStudentId: string) {
  return await getDb().query.studentModels.findFirst({
    where: eq(studentModels.classroomStudentId, classroomStudentId),
  });
}

export async function getLatestStudentModelSnapshot(studentModelId: string) {
  return await getDb().query.studentModelSnapshots.findFirst({
    where: eq(studentModelSnapshots.studentModelId, studentModelId),
    orderBy: [desc(studentModelSnapshots.version)],
  });
}

export async function createStudentModelSnapshot(params: {
  studentModelId: string;
  snapshot: StudentModelSnapshot;
  sourceType: string;
  sourceId?: string | null;
}) {
  const latest = await getLatestStudentModelSnapshot(params.studentModelId);
  const version = (latest?.version ?? 0) + 1;
  const normalizedSnapshot = studentModelSnapshotSchema.parse({
    ...params.snapshot,
    version,
  });

  const [snapshot] = await getDb()
    .insert(studentModelSnapshots)
    .values({
      id: nanoid(),
      studentModelId: params.studentModelId,
      version,
      snapshot: normalizedSnapshot,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(studentModels)
    .set({
      latestSnapshotId: snapshot.id,
      summary: normalizedSnapshot.summary,
      updatedAt: new Date(),
    })
    .where(eq(studentModels.id, params.studentModelId));

  return snapshot;
}

export async function createStudentModelAnalysis(params: {
  studentModelId: string;
  topicId?: string | null;
  sessionId?: string | null;
  sourceType: string;
  sourceId: string;
  status?: string;
  notes?: Record<string, unknown>;
}) {
  const [analysis] = await getDb()
    .insert(studentModelAnalyses)
    .values({
      id: nanoid(),
      studentModelId: params.studentModelId,
      topicId: params.topicId ?? null,
      sessionId: params.sessionId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: params.status ?? "completed",
      notes: params.notes ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return analysis;
}

export async function listStudentModelSummaries(params: {
  studentUserId: string;
}) {
  const models = await getDb().query.studentModels.findMany({
    where: eq(studentModels.studentUserId, params.studentUserId),
    with: {
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
      snapshots: {
        orderBy: [desc(studentModelSnapshots.version)],
        limit: 1,
      },
    },
  });

  return models.map((model) => ({
    ...model,
    latestSnapshot: model.snapshots[0] ?? null,
  }));
}

export async function ensureTopicFramework(params: {
  topicId: string;
  classroomId?: string | null;
}) {
  const existing = await getDb().query.expertFrameworks.findFirst({
    where: eq(expertFrameworks.topicId, params.topicId),
  });

  if (existing) {
    return existing;
  }

  const [framework] = await getDb()
    .insert(expertFrameworks)
    .values({
      id: nanoid(),
      topicId: params.topicId,
      classroomId: params.classroomId ?? null,
      name: "DEEP",
      description:
        "Default seeded framework. Experts can edit, replace, or delete it.",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const defaultFramework = createDefaultDeepFramework();
  const [version] = await getDb()
    .insert(expertFrameworkVersions)
    .values({
      id: nanoid(),
      frameworkId: framework.id,
      version: 1,
      status: "published",
      seedSource: "deep_default",
      framework: defaultFramework,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(expertFrameworks)
    .set({
      activeVersionId: version.id,
      updatedAt: new Date(),
    })
    .where(eq(expertFrameworks.id, framework.id));

  return {
    ...framework,
    activeVersionId: version.id,
  };
}

export async function getActiveFrameworkVersion(topicId: string) {
  const framework = await ensureTopicFramework({ topicId });
  return await getDb().query.expertFrameworkVersions.findFirst({
    where: and(
      eq(expertFrameworkVersions.frameworkId, framework.id),
      eq(expertFrameworkVersions.id, framework.activeVersionId ?? ""),
    ),
  });
}

export async function listApprovedCrystallizations(params: {
  topicId: string;
  frameworkVersionId?: string;
}) {
  return await getDb().query.expertCrystallizations.findMany({
    where: and(
      eq(expertCrystallizations.topicId, params.topicId),
      eq(expertCrystallizations.status, "approved"),
      or(
        eq(expertCrystallizations.relevanceScope, "general"),
        and(
          eq(expertCrystallizations.relevanceScope, "framework_specific"),
          eq(expertCrystallizations.frameworkVersionId, params.frameworkVersionId ?? ""),
        ),
      ),
    ),
    orderBy: [asc(expertCrystallizations.createdAt)],
  });
}

export async function listOpenConflicts(params: { topicId: string }) {
  return await getDb().query.expertConflicts.findMany({
    where: and(
      eq(expertConflicts.topicId, params.topicId),
      eq(expertConflicts.status, "open"),
    ),
    orderBy: [desc(expertConflicts.createdAt)],
  });
}

export async function createRuntimeModel(params: {
  topicId: string;
  frameworkId: string;
  frameworkVersionId: string;
  runtimeModel: ExpertTutorRuntimeModel;
  conflictIds?: string[];
  status?: "draft" | "published" | "archived";
}) {
  const latest = await getDb().query.expertRuntimeModels.findFirst({
    where: eq(expertRuntimeModels.topicId, params.topicId),
    orderBy: [desc(expertRuntimeModels.version)],
  });

  const nextVersion = (latest?.version ?? 0) + 1;
  const [created] = await getDb()
    .insert(expertRuntimeModels)
    .values({
      id: nanoid(),
      topicId: params.topicId,
      frameworkId: params.frameworkId,
      frameworkVersionId: params.frameworkVersionId,
      version: nextVersion,
      status: params.status ?? "published",
      runtimeModel: expertTutorRuntimeModelSchema.parse({
        ...params.runtimeModel,
        version: nextVersion,
      }),
      conflictIds: params.conflictIds ?? [],
      publishedAt: params.status === "draft" ? null : new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function getPublishedRuntimeModel(topicId: string) {
  return await getDb().query.expertRuntimeModels.findFirst({
    where: and(
      eq(expertRuntimeModels.topicId, topicId),
      eq(expertRuntimeModels.status, "published"),
    ),
    orderBy: [desc(expertRuntimeModels.version)],
  });
}

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
