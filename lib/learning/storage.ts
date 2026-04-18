import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  classroomStudents,
  learningExpertAnnotations,
  learningInteractions,
  learningMessages,
  learningSessions,
  studentLearningPatternAnalyses,
  studentLearningPatternProfiles,
  learningTopics,
  studentInterestProfiles,
  studentProgressReports,
  topicMaterials,
} from "@/db/schema";
import {
  indexLearningInteractionEvidence,
  indexLearningPatternEvidence,
  indexLearningReportEvidence,
} from "@/lib/learning/evidence";
import type { StudentLearningPatternProfile } from "@/lib/learning/pattern-types";
import type {
  LearningInteractionType,
  LearningSessionState,
  QuestionIntent,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/lib/learning/types";
import { createDefaultLearningSessionState } from "@/lib/learning/types";
import type { ExpertAnnotation } from "@/lib/learning/expert-types";

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
  const sessionId = nanoid();
  const [session] = await getDb()
    .insert(learningSessions)
    .values({
      id: sessionId,
      topicId: params.topicId ?? null,
      classroomStudentId: params.classroomStudentId,
      sessionType: params.sessionType,
      sessionLocale: params.sessionLocale ?? "en",
      sessionStatus: "active",
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
}) {
  const updatePayload: {
    state: LearningSessionState;
    updatedAt: Date;
    sessionStatus?: string;
    summary?: string | null;
  } = {
    state: params.state,
    updatedAt: new Date(),
  };

  if (params.sessionStatus !== undefined) {
    updatePayload.sessionStatus = params.sessionStatus;
  }

  if (params.summary !== undefined) {
    updatePayload.summary = params.summary;
  }

  const [session] = await getDb()
    .update(learningSessions)
    .set(updatePayload)
    .where(eq(learningSessions.id, params.sessionId))
    .returning();

  return session;
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

export async function logLearningInteraction(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionId?: string | null;
  role: string;
  interactionType: LearningInteractionType;
  content: string;
  phaseId?: number | null;
  phaseType?: string | null;
  conceptKey?: string | null;
  questionType?: QuestionIntent | null;
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
      phaseId: params.phaseId ?? null,
      phaseType: params.phaseType ?? null,
      conceptKey: params.conceptKey ?? null,
      content: params.content,
      metadata: {
        ...(params.metadata ?? {}),
        ...(params.questionType ? { questionType: params.questionType } : {}),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, params.classroomStudentId),
    with: {
      classroom: true,
    },
  });

  const topic = params.topicId
    ? await getDb().query.learningTopics.findFirst({
        where: eq(learningTopics.id, params.topicId),
      })
    : null;

  if (membership?.classroom.organizationId) {
    void indexLearningInteractionEvidence({
      organizationId: membership.classroom.organizationId,
      topicId: params.topicId ?? null,
      classroomStudentId: params.classroomStudentId,
      studentUserId: membership.userId ?? null,
      interactionId: interaction.id,
      topicTitle: topic?.title ?? null,
      language: topic?.contentLocale ?? membership.classroom.defaultContentLocale,
      role: params.role,
      interactionType: params.interactionType,
      content: params.content,
      metadata: interaction.metadata as Record<string, unknown> | null,
    }).catch(() => undefined);
  }

  return interaction;
}

export async function listLearningInteractions(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionId?: string | null;
}) {
  if (params.sessionId) {
    return await getDb().query.learningInteractions.findMany({
      where: eq(learningInteractions.sessionId, params.sessionId),
      orderBy: [asc(learningInteractions.createdAt)],
    });
  }

  if (params.topicId) {
    return await getDb().query.learningInteractions.findMany({
      where: and(
        eq(learningInteractions.classroomStudentId, params.classroomStudentId),
        eq(learningInteractions.topicId, params.topicId),
      ),
      orderBy: [asc(learningInteractions.createdAt)],
    });
  }

  return await getDb().query.learningInteractions.findMany({
    where: eq(learningInteractions.classroomStudentId, params.classroomStudentId),
    orderBy: [asc(learningInteractions.createdAt)],
  });
}

export async function completeLearningSession(params: {
  sessionId: string;
  summary?: string | null;
  state?: LearningSessionState;
  sessionStatus?: string;
}) {
  const updatePayload: {
    sessionStatus: string;
    summary: string | null;
    state?: LearningSessionState;
    completedAt: Date;
    updatedAt: Date;
  } = {
    sessionStatus: params.sessionStatus ?? "completed",
    summary: params.summary ?? null,
    completedAt: new Date(),
    updatedAt: new Date(),
  };

  if (params.state !== undefined) {
    updatePayload.state = params.state;
  }

  await getDb()
    .update(learningSessions)
    .set(updatePayload)
    .where(eq(learningSessions.id, params.sessionId));
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
        lastRefreshedAt: new Date(params.profile.lastUpdated),
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
      lastRefreshedAt: new Date(params.profile.lastUpdated),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function markStudentOnboardingComplete(classroomStudentId: string) {
  await getDb()
    .update(classroomStudents)
    .set({
      onboardingStatus: "complete",
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(classroomStudents.id, classroomStudentId));
}

export async function createStudentProgressReport(params: {
  topicId: string;
  classroomStudentId: string;
  generatedFromSessionId?: string | null;
  masteryPercent: number;
  sourceLocale?: string | null;
  report: TeacherProgressReport;
}) {
  const [created] = await getDb()
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

  const [membership, topic] = await Promise.all([
    getDb().query.classroomStudents.findFirst({
      where: eq(classroomStudents.id, params.classroomStudentId),
      with: {
        classroom: true,
      },
    }),
    getDb().query.learningTopics.findFirst({
      where: eq(learningTopics.id, params.topicId),
    }),
  ]);

  if (membership?.classroom.organizationId && topic) {
    void indexLearningReportEvidence({
      organizationId: membership.classroom.organizationId,
      topicId: params.topicId,
      classroomStudentId: params.classroomStudentId,
      studentUserId: membership.userId ?? null,
      reportId: created.id,
      topicTitle: topic.title,
      masteryPercent: params.masteryPercent,
      report: params.report,
      language: params.sourceLocale,
    }).catch(() => undefined);
  }

  return created;
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

export async function listStudentLearningPatternProfiles(params: {
  organizationId: string;
  studentUserId: string;
}) {
  return await getDb().query.studentLearningPatternProfiles.findMany({
    where: and(
      eq(studentLearningPatternProfiles.organizationId, params.organizationId),
      eq(studentLearningPatternProfiles.studentUserId, params.studentUserId),
    ),
    orderBy: [asc(studentLearningPatternProfiles.scopeType), asc(studentLearningPatternProfiles.scopeRef)],
  });
}

export async function getStudentLearningPatternProfile(params: {
  organizationId: string;
  studentUserId: string;
  scopeType: "global" | "subject";
  scopeRef: string;
}) {
  return await getDb().query.studentLearningPatternProfiles.findFirst({
    where: and(
      eq(studentLearningPatternProfiles.organizationId, params.organizationId),
      eq(studentLearningPatternProfiles.studentUserId, params.studentUserId),
      eq(studentLearningPatternProfiles.scopeType, params.scopeType),
      eq(studentLearningPatternProfiles.scopeRef, params.scopeRef),
    ),
  });
}

export async function upsertStudentLearningPatternProfile(params: {
  organizationId: string;
  studentUserId: string;
  scopeType: "global" | "subject";
  scopeRef: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  patternConfidencePercent: number;
  confidenceByDimension: Record<string, number>;
  profile: StudentLearningPatternProfile;
  summaryLocale?: string | null;
  teacherSummary: string;
  studentSummary: string;
  engagementTrend: string;
  lastAnalyzedSourceType?: string | null;
  lastAnalyzedSourceId?: string | null;
  lastMem0SyncAt?: Date | null;
}) {
  const existing = await getStudentLearningPatternProfile({
    organizationId: params.organizationId,
    studentUserId: params.studentUserId,
    scopeType: params.scopeType,
    scopeRef: params.scopeRef,
  });

  if (existing) {
    const [updated] = await getDb()
      .update(studentLearningPatternProfiles)
      .set({
        subjectKey: params.subjectKey ?? null,
        subjectLabel: params.subjectLabel ?? null,
        patternConfidencePercent: params.patternConfidencePercent,
        confidenceByDimension: params.confidenceByDimension,
        profile: params.profile,
        summaryLocale: params.summaryLocale ?? "en",
        teacherSummary: params.teacherSummary,
        studentSummary: params.studentSummary,
        engagementTrend: params.engagementTrend,
        lastAnalyzedSourceType: params.lastAnalyzedSourceType ?? null,
        lastAnalyzedSourceId: params.lastAnalyzedSourceId ?? null,
        lastMem0SyncAt: params.lastMem0SyncAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(studentLearningPatternProfiles.id, existing.id))
      .returning();

    void indexLearningPatternEvidence({
      organizationId: params.organizationId,
      studentUserId: params.studentUserId,
      profileId: updated.id,
      subjectKey: params.subjectKey ?? null,
      subjectLabel: params.subjectLabel ?? null,
      scopeType: params.scopeType,
      summaryLocale: params.summaryLocale ?? "en",
      teacherSummary: params.teacherSummary,
      studentSummary: params.studentSummary,
      profile: params.profile,
    }).catch(() => undefined);

    return updated;
  }

  const [created] = await getDb()
    .insert(studentLearningPatternProfiles)
    .values({
      id: nanoid(),
      organizationId: params.organizationId,
      studentUserId: params.studentUserId,
      scopeType: params.scopeType,
      scopeRef: params.scopeRef,
      subjectKey: params.subjectKey ?? null,
      subjectLabel: params.subjectLabel ?? null,
      patternConfidencePercent: params.patternConfidencePercent,
      confidenceByDimension: params.confidenceByDimension,
      profile: params.profile,
      summaryLocale: params.summaryLocale ?? "en",
      teacherSummary: params.teacherSummary,
      studentSummary: params.studentSummary,
      engagementTrend: params.engagementTrend,
      lastAnalyzedSourceType: params.lastAnalyzedSourceType ?? null,
      lastAnalyzedSourceId: params.lastAnalyzedSourceId ?? null,
      lastMem0SyncAt: params.lastMem0SyncAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  void indexLearningPatternEvidence({
    organizationId: params.organizationId,
    studentUserId: params.studentUserId,
    profileId: created.id,
    subjectKey: params.subjectKey ?? null,
    subjectLabel: params.subjectLabel ?? null,
    scopeType: params.scopeType,
    summaryLocale: params.summaryLocale ?? "en",
    teacherSummary: params.teacherSummary,
    studentSummary: params.studentSummary,
    profile: params.profile,
  }).catch(() => undefined);

  return created;
}

export async function getLearningPatternAnalysisBySource(params: {
  sourceType: "onboarding" | "session";
  sourceId: string;
}) {
  return await getDb().query.studentLearningPatternAnalyses.findFirst({
    where: and(
      eq(studentLearningPatternAnalyses.sourceType, params.sourceType),
      eq(studentLearningPatternAnalyses.sourceId, params.sourceId),
    ),
  });
}

export async function createLearningPatternAnalysis(params: {
  organizationId: string;
  studentUserId: string;
  classroomStudentId?: string | null;
  topicId?: string | null;
  sourceType: "onboarding" | "session";
  sourceId: string;
}) {
  const existing = await getLearningPatternAnalysisBySource({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
  });

  if (existing) {
    return existing;
  }

  const [created] = await getDb()
    .insert(studentLearningPatternAnalyses)
    .values({
      id: nanoid(),
      organizationId: params.organizationId,
      studentUserId: params.studentUserId,
      classroomStudentId: params.classroomStudentId ?? null,
      topicId: params.topicId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: "queued",
      retryCount: 0,
      mem0References: [],
      profileScopeRefs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function markLearningPatternAnalysisRunning(analysisId: string) {
  const [updated] = await getDb()
    .update(studentLearningPatternAnalyses)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(studentLearningPatternAnalyses.id, analysisId))
    .returning();

  return updated;
}

export async function completeLearningPatternAnalysis(params: {
  analysisId: string;
  mem0References: Array<Record<string, unknown>>;
  profileScopeRefs: Array<Record<string, string | null>>;
}) {
  const [updated] = await getDb()
    .update(studentLearningPatternAnalyses)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      mem0References: params.mem0References,
      profileScopeRefs: params.profileScopeRefs,
      errorMessage: null,
    })
    .where(eq(studentLearningPatternAnalyses.id, params.analysisId))
    .returning();

  return updated;
}

export async function failLearningPatternAnalysis(params: {
  analysisId: string;
  errorMessage: string;
}) {
  const existing = await getDb().query.studentLearningPatternAnalyses.findFirst({
    where: eq(studentLearningPatternAnalyses.id, params.analysisId),
  });

  const [updated] = await getDb()
    .update(studentLearningPatternAnalyses)
    .set({
      status: "failed",
      retryCount: (existing?.retryCount ?? 0) + 1,
      errorMessage: params.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(studentLearningPatternAnalyses.id, params.analysisId))
    .returning();

  return updated;
}

export async function listRecentOutOfSessionInteractions(params: {
  classroomStudentId: string;
  topicId: string;
  since?: Date | null;
}) {
  const conditions = [
    eq(learningInteractions.classroomStudentId, params.classroomStudentId),
    eq(learningInteractions.topicId, params.topicId),
    isNull(learningInteractions.sessionId),
    or(
      eq(learningInteractions.interactionType, "out_of_session_question"),
      eq(learningInteractions.interactionType, "agent_answer"),
    ),
  ];

  if (params.since) {
    conditions.push(gt(learningInteractions.createdAt, params.since));
  }

  return await getDb().query.learningInteractions.findMany({
    where: and(...conditions),
    orderBy: [asc(learningInteractions.createdAt)],
  });
}

export async function listExpertReviewQueue(params: {
  organizationId: string;
  limit?: number;
}) {
  const reports = await getDb().query.studentProgressReports.findMany({
    where: eq(studentProgressReports.visibility, "teacher_only"),
    with: {
      classroomStudent: true,
      topic: {
        with: {
          classroom: true,
        },
      },
    },
    orderBy: [desc(studentProgressReports.updatedAt)],
    limit: params.limit ?? 24,
  });

  const reportIds = reports.map((report) => report.id);
  const sessionIds = reports
    .map((report) => report.generatedFromSessionId)
    .filter((value): value is string => Boolean(value));
  const topicIds = reports
    .map((report) => report.topicId)
    .filter((value): value is string => Boolean(value));
  const reviewedAnnotations =
    reportIds.length === 0
      ? []
      : await getDb().query.learningExpertAnnotations.findMany({
          where: and(
            eq(learningExpertAnnotations.organizationId, params.organizationId),
            inArray(learningExpertAnnotations.status, ["reviewed", "published"]),
            sessionIds.length > 0 && topicIds.length > 0
              ? or(
                  inArray(learningExpertAnnotations.sessionId, sessionIds),
                  inArray(learningExpertAnnotations.topicId, topicIds),
                )
              : sessionIds.length > 0
                ? inArray(learningExpertAnnotations.sessionId, sessionIds)
                : topicIds.length > 0
                  ? inArray(learningExpertAnnotations.topicId, topicIds)
                  : undefined,
          ),
        });
  const reviewedQueueKeys = new Set(
    reviewedAnnotations.flatMap((annotation) => {
      const reviewQueueKey =
        typeof annotation.metadata?.reviewQueueKey === "string"
          ? annotation.metadata.reviewQueueKey
          : null;
      if (reviewQueueKey && reportIds.includes(reviewQueueKey)) {
        return [reviewQueueKey];
      }

      const matchedReport = reports.find(
        (report) =>
          (annotation.sessionId && report.generatedFromSessionId === annotation.sessionId) ||
          (annotation.topicId && report.topicId === annotation.topicId &&
            annotation.classroomStudentId === report.classroomStudentId),
      );
      return matchedReport ? [matchedReport.id] : [];
    }),
  );

  return reports
    .filter(
      (report) =>
        report.topic?.classroom?.organizationId === params.organizationId &&
        !reviewedQueueKeys.has(report.id),
    )
    .map((report) => {
      const reasons = [
        ...(report.report.persistentMisconceptions ?? []),
        ...(report.report.riskFlags ?? []),
        ...(report.report.transferReadiness === "not_yet"
          ? ["Transfer readiness is still low."]
          : []),
        ...(report.report.originalityWithinConstraint === "low"
          ? ["Originality within constraint is still weak."]
          : []),
      ];
      return {
        key: report.id,
        sessionId: report.generatedFromSessionId ?? null,
        topicId: report.topicId,
        classroomStudentId: report.classroomStudentId,
        studentName: report.classroomStudent?.fullName ?? null,
        topicTitle: report.topic?.title ?? null,
        subjectKey: report.topic?.subjectKey ?? null,
        subjectLabel: report.topic?.subjectLabel ?? null,
        priority:
          (report.report.riskFlags?.length ?? 0) > 0 ||
          report.report.transferReadiness === "not_yet"
            ? "high"
            : (report.report.persistentMisconceptions?.length ?? 0) > 0
              ? "medium"
              : "low",
        reasons: reasons.slice(0, 4),
        createdAt: report.updatedAt.toISOString(),
      };
    });
}

export async function listLearningExpertAnnotations(params: {
  organizationId: string;
  topicId?: string | null;
  sessionId?: string | null;
}) {
  return await getDb().query.learningExpertAnnotations.findMany({
    where:
      params.sessionId != null
        ? and(
            eq(learningExpertAnnotations.organizationId, params.organizationId),
            eq(learningExpertAnnotations.sessionId, params.sessionId),
          )
        : params.topicId != null
          ? and(
              eq(learningExpertAnnotations.organizationId, params.organizationId),
              eq(learningExpertAnnotations.topicId, params.topicId),
            )
          : eq(learningExpertAnnotations.organizationId, params.organizationId),
    orderBy: [desc(learningExpertAnnotations.updatedAt)],
  });
}

export async function createLearningExpertAnnotation(params: {
  annotation: ExpertAnnotation;
}) {
  const [created] = await getDb()
    .insert(learningExpertAnnotations)
    .values({
      id: params.annotation.id,
      organizationId: params.annotation.organizationId,
      topicId: params.annotation.topicId,
      classroomStudentId: params.annotation.classroomStudentId,
      sessionId: params.annotation.sessionId,
      interactionId: params.annotation.interactionId,
      subjectKey: params.annotation.subjectKey,
      curriculumFrameworkKey: params.annotation.curriculumFrameworkKey,
      annotationType: params.annotation.annotationType,
      status: params.annotation.status,
      summary: params.annotation.summary,
      evidence: params.annotation.evidence,
      metadata: params.annotation.metadata,
      createdByUserId: params.annotation.createdByUserId,
      createdAt: new Date(params.annotation.createdAt),
      updatedAt: new Date(params.annotation.updatedAt),
    })
    .returning();

  return created;
}
