import { cache } from "react";
import { generateText, Output } from "ai";
import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { analysisModel } from "@/lib/ai";
import { getDb } from "@/db";
import {
  classroomStudents,
  folders,
  learningInteractions,
  learningSessions,
  learningTopics,
  notifications,
  sampleConversations,
  studentProgressReports,
  surveyBriefs,
  surveyCreationConversations,
  surveyConversations,
  surveyCoveragePlans,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
  surveys,
  topicMaterials,
} from "@/db/schema";
import { getCurrentSession, getPlatformRole, getVerifiedSession } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { listStudentMemberships, getTeacherTopicAccess } from "@/lib/learning/access";
import * as ClassroomService from "@/lib/learning/classroom-service";
import * as InterventionService from "@/lib/learning/intervention-service";
import { getOnboardingState } from "@/lib/learning/onboarding-route-service";
import { buildClassroomTopicReportSummary } from "@/lib/learning/reporting";
import {
  listPendingInvitationsForUser,
  listPendingClassroomInvitations,
} from "@/lib/learning/student-service";
import {
  resolveTeacherClassroomAccess,
  resolveTeacherStudentAccess,
} from "@/lib/learning/teacher-route-access";
import {
  getTopicWithMaterials,
  listLearningMessages,
  listStudentModelSummaries,
} from "@/lib/learning/storage";
import {
  ensureTutoringSession,
  resolveStudentTutoringContext,
} from "@/lib/learning/tutoring-route-orchestrator";
import { getSurveyPermissionForSession, hasSurveyPermission } from "@/lib/survey-access";
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/config";
import type {
  ClassroomStudentOverviewResponse,
  LearningMeData,
  TeacherPatternResponse,
  TopicOverviewResponse,
} from "@/lib/api/learning";
import type {
  SurveyDetailsResponse,
  SurveyListItem,
} from "@/lib/api/surveys";
import type { AnalyticsSessionDetail } from "@/lib/analytics";
import type { ConversationInsight, CoverageNode, EvidenceRecord } from "@/lib/education/types";
import { conversationInsightSchema, evidenceRecordSchema } from "@/lib/education/types";
import { listSurveysForUser } from "@/lib/surveys/surveys-route-service";
import { toPersistedUIChatMessages, toVisibleConversationMessages } from "@/lib/chat-ui-messages";
import {
  type AnalyticsPendingData,
  type SurveyAnalyticsData,
} from "@/lib/analytics";
import { getSurveyAnalyticsViewModel } from "@/lib/surveys/use-cases/get-survey-analytics";
import { learningSessionStateSchema } from "@/lib/learning/types";

type NotificationRecord = typeof notifications.$inferSelect;

type FolderSurveyListItem = {
  id: string;
  title: string | null;
  status: string;
  currentParticipants: number;
  isVoice: boolean;
  createdAt: Date;
  folderId: string | null;
};

type FolderDetailSurveyItem = typeof surveys.$inferSelect & {
  summary: string | null;
  completedCount: number;
};

const readinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});

function toOptionalAppLocale(value: string | null | undefined): AppLocale | undefined {
  return value ? normalizeAppLocale(value) : undefined;
}

export const getLearningMeData = cache(async (): Promise<LearningMeData> => {
  const session = await getVerifiedSession();
  const [memberships, invitations] = await Promise.all([
    listStudentMemberships(session.user.id),
    listPendingInvitationsForUser(session.user.id),
  ]);

  if (memberships.length === 0) {
    const learnerPersona = getPlatformRole(session.user) === "student";
    const serializedInvitations = invitations.map((invitation) => ({
      id: invitation.id,
      classroomId: invitation.classroomId,
      classroomTitle: invitation.classroom?.title ?? "Classroom",
      invitedEmail: invitation.invitedEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    }));

    if (learnerPersona) {
      return {
        role: "student",
        student: [],
        invitations: serializedInvitations,
      };
    }

    return {
      role: "non-student",
      student: null,
      invitations: serializedInvitations,
    };
  }

  const student = await Promise.all(
    memberships.map(async (membership) => {
      const [topics, classroomSurveys] = await Promise.all([
        getDb().query.learningTopics.findMany({
          where: (table, operators) =>
            operators.and(
              operators.eq(table.classroomId, membership.classroomId),
              operators.eq(table.status, "active"),
            ),
        }),
        getDb().query.surveys.findMany({
          where: (table, operators) =>
            operators.and(
              operators.eq(table.classroomId, membership.classroomId),
              operators.eq(table.deliveryMode, "classroom_assigned"),
              operators.eq(table.status, "active"),
              operators.isNotNull(table.shareableLink),
            ),
          orderBy: (table, operators) => [operators.desc(table.updatedAt)],
        }),
      ]);

      const classroomSurveyIds = classroomSurveys.map((survey) => survey.id);
      const classroomSurveyConversations =
        classroomSurveyIds.length > 0
          ? await getDb().query.surveyConversations.findMany({
              where: and(
                inArray(surveyConversations.surveyId, classroomSurveyIds),
                eq(surveyConversations.participantId, membership.id),
              ),
              orderBy: [desc(surveyConversations.updatedAt)],
            })
          : [];

      const latestConversationBySurveyId = new Map<
        string,
        { completed: boolean; updatedAt: Date }
      >();

      for (const conversation of classroomSurveyConversations) {
        if (!latestConversationBySurveyId.has(conversation.surveyId)) {
          latestConversationBySurveyId.set(conversation.surveyId, {
            completed: conversation.completed,
            updatedAt: conversation.updatedAt,
          });
        }
      }

      return {
        classroomStudentId: membership.id,
        fullName: membership.fullName,
        classroom: {
          id: membership.classroom.id,
          title: membership.classroom.title,
          gradeBand: membership.classroom.gradeBand,
          gradeLabel: membership.classroom.gradeLabel,
        },
        needsOnboarding: !membership.interestProfile,
        profileLastUpdated: membership.interestProfile?.profile.lastUpdated ?? null,
        topics: topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          subject: topic.subject,
          subjectKey: topic.subjectKey,
          subjectLabel: topic.subjectLabel,
          status: topic.status,
        })),
        surveys: classroomSurveys.flatMap((survey) => {
          if (!survey.shareableLink) {
            return [];
          }

          const latestConversation = latestConversationBySurveyId.get(survey.id);
          const responseStatus: "completed" | "in_progress" | "not_started" =
            latestConversation?.completed
              ? "completed"
              : latestConversation
                ? "in_progress"
                : "not_started";

          return [
            {
              id: survey.id,
              title: survey.title,
              status: survey.status,
              isVoice: survey.isVoice,
              shareableLink: survey.shareableLink,
              createdAt: survey.createdAt?.toISOString() ?? null,
              responseStatus,
              completedAt:
                latestConversation?.completed
                  ? latestConversation.updatedAt.toISOString()
                  : null,
            },
          ];
        }),
      };
    }),
  );

  return {
    role: "student",
    student,
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      classroomId: invitation.classroomId,
      classroomTitle: invitation.classroom?.title ?? "Classroom",
      invitedEmail: invitation.invitedEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
    })),
  };
});

export const getMyPatternSummaries = cache(async () => {
  const session = await getVerifiedSession();
  const memberships = await getDb().query.classroomStudents.findMany({
    where: and(
      eq(classroomStudents.userId, session.user.id),
      eq(classroomStudents.inviteStatus, "accepted"),
    ),
    with: {
      classroom: true,
    },
  });

  if (memberships.length === 0) {
    return { success: true as const, data: [] };
  }

  const models = await listStudentModelSummaries({
    studentUserId: session.user.id,
  });

  return {
    success: true as const,
    data: models.map((model) => ({
      scopeType: "student",
      subjectKey: null,
      subjectLabel: model.classroomStudent.classroom.title,
      patternConfidence:
        model.latestSnapshot?.snapshot.cognitiveStyleCalibration.confidence ?? 0,
      confidenceLabel:
        model.latestSnapshot?.snapshot.cognitiveStyleCalibration.confidence &&
        model.latestSnapshot.snapshot.cognitiveStyleCalibration.confidence > 0.65
          ? "Established"
          : "Emerging",
      studentSummary:
        model.latestSnapshot?.snapshot.summary || "Personalization model is still forming.",
      persistentMisconceptions: [],
      updatedAt: model.latestSnapshot?.updatedAt ?? model.updatedAt,
      motivationalContext:
        model.latestSnapshot?.snapshot.motivationalContext ?? null,
      cognitiveStyleCalibration:
        model.latestSnapshot?.snapshot.cognitiveStyleCalibration ?? null,
      productiveStruggleCalibration:
        model.latestSnapshot?.snapshot.productiveStruggleCalibration ?? null,
      longitudinalDevelopment:
        model.latestSnapshot?.snapshot.longitudinalDevelopment ?? null,
    })),
  };
});

export async function getClassroomStudentOverviewData(
  classroomStudentId: string,
): Promise<ClassroomStudentOverviewResponse> {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, classroomStudentId),
    with: {
      classroom: true,
      interestProfile: true,
    },
  });

  if (!membership) {
    throw new Error("Student not found");
  }

  const [reports, tutoringSessions] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, membership.id),
      with: {
        topic: true,
      },
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.learningSessions.findMany({
      where: and(
        eq(learningSessions.classroomStudentId, membership.id),
        eq(learningSessions.sessionType, "tutoring"),
      ),
      with: {
        topic: true,
      },
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
      limit: 20,
    }),
  ]);
  const tutoringSessionIds = tutoringSessions.map((sessionRow) => sessionRow.id);
  const conversationTurns =
    tutoringSessionIds.length > 0
      ? await getDb().query.learningInteractions.findMany({
          where: and(
            eq(learningInteractions.classroomStudentId, membership.id),
            inArray(learningInteractions.sessionId, tutoringSessionIds),
            inArray(learningInteractions.interactionType, [
              "student_message",
              "tutor_message",
            ]),
          ),
          with: {
            topic: true,
          },
          orderBy: (table, { asc }) => [asc(table.createdAt)],
        })
      : [];
  const classroomRoster = await getDb().query.classroomStudents.findMany({
    where: eq(classroomStudents.classroomId, membership.classroomId),
    orderBy: (table, { asc }) => [asc(table.fullName)],
    columns: {
      id: true,
      fullName: true,
    },
  });

  const currentStudentIndex = classroomRoster.findIndex(
    (student) => student.id === membership.id,
  );
  const previousStudent =
    currentStudentIndex > 0 ? classroomRoster[currentStudentIndex - 1] : null;
  const nextStudent =
    currentStudentIndex >= 0 && currentStudentIndex < classroomRoster.length - 1
      ? classroomRoster[currentStudentIndex + 1]
      : null;

  return {
    success: true as const,
    data: {
      student: {
        id: membership.id,
        fullName: membership.fullName,
        email: membership.email,
        inviteStatus: membership.inviteStatus,
        onboardingStatus: membership.onboardingStatus,
        profileLastUpdated: membership.interestProfile?.lastRefreshedAt?.toISOString() ?? null,
        classroom: {
          id: membership.classroom.id,
          title: membership.classroom.title,
          gradeBand: membership.classroom.gradeBand,
          gradeLabel: membership.classroom.gradeLabel,
        },
      },
      recentReports: reports.map((report) => ({
        id: report.id,
        topicId: report.topicId,
        topicTitle: report.topic?.title ?? "Topic",
        masteryPercent: report.masteryPercent,
        sourceLocale: report.sourceLocale,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        report: report.report,
      })),
      tutoringSessions: tutoringSessions.map((sessionRow) => ({
        id: sessionRow.id,
        topicId: sessionRow.topicId,
        topicTitle: sessionRow.topic?.title ?? null,
        sessionStatus: sessionRow.sessionStatus,
        sessionLocale: sessionRow.sessionLocale,
        summary: sessionRow.summary ?? null,
        createdAt: sessionRow.createdAt,
        updatedAt: sessionRow.updatedAt,
        completedAt: sessionRow.completedAt,
      })),
      conversationTurns: conversationTurns.flatMap((interaction) =>
        interaction.sessionId
          ? [
              {
                id: interaction.id,
                topicId: interaction.topicId,
                topicTitle: interaction.topic?.title ?? null,
                sessionId: interaction.sessionId,
                interactionType: interaction.interactionType,
                role: interaction.role,
                content: interaction.content,
                createdAt: interaction.createdAt,
              },
            ]
          : [],
      ),
      navigation: {
        previousStudent: previousStudent
          ? {
              id: previousStudent.id,
              fullName: previousStudent.fullName,
            }
          : null,
        nextStudent: nextStudent
          ? {
              id: nextStudent.id,
              fullName: nextStudent.fullName,
            }
          : null,
        position: currentStudentIndex >= 0 ? currentStudentIndex + 1 : 1,
        totalStudents: classroomRoster.length,
      },
    },
  };
}

export async function getClassroomStudentPatternData(
  classroomStudentId: string,
): Promise<TeacherPatternResponse> {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: (table, { eq: eqTable }) => eqTable(table.id, classroomStudentId),
    with: {
      classroom: true,
      studentModel: {
        with: {
          snapshots: {
            orderBy: (table, { desc: orderDesc }) => [orderDesc(table.version)],
            limit: 1,
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("Student not found");
  }

  const latestSnapshot = membership.studentModel?.snapshots[0]?.snapshot ?? null;

  return {
    success: true as const,
    data: {
      student: {
        id: membership.id,
        fullName: membership.fullName,
        email: membership.email,
      },
      profiles: latestSnapshot
        ? [
            {
              scopeType: "student",
              subjectKey: null,
              subjectLabel: membership.classroom.title,
              patternConfidence:
                latestSnapshot.cognitiveStyleCalibration.confidence ?? 0,
              confidenceLabel:
                latestSnapshot.cognitiveStyleCalibration.confidence > 0.65
                  ? "Established"
                  : "Emerging",
              studentSummary: latestSnapshot.summary,
              persistentMisconceptions: [],
              updatedAt: membership.studentModel?.snapshots[0]?.updatedAt,
              motivationalContext: latestSnapshot.motivationalContext,
              knowledgeStateModel: latestSnapshot.knowledgeStateModel,
              cognitiveStyleCalibration: latestSnapshot.cognitiveStyleCalibration,
              productiveStruggleCalibration:
                latestSnapshot.productiveStruggleCalibration,
              longitudinalDevelopment: latestSnapshot.longitudinalDevelopment,
            },
          ]
        : [],
    },
  };
}

export async function getClassroomStudentReportDetailData(params: {
  classroomStudentId: string;
  reportId: string;
}) {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId: params.classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const report = await getDb().query.studentProgressReports.findFirst({
    where: and(
      eq(studentProgressReports.id, params.reportId),
      eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
    ),
    with: {
      topic: true,
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  return {
    success: true as const,
    data: {
      id: report.id,
      masteryPercent: report.masteryPercent,
      sourceLocale: report.sourceLocale,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      sessionId: report.generatedFromSessionId,
      topic: {
        id: report.topicId,
        title: report.topic?.title ?? "Topic",
        subject: report.topic?.subject ?? null,
        subjectLabel: report.topic?.subjectLabel ?? null,
        status: report.topic?.status ?? "draft",
      },
      student: {
        id: report.classroomStudent.id,
        fullName: report.classroomStudent.fullName,
        email: report.classroomStudent.email,
        classroom: {
          id: report.classroomStudent.classroom.id,
          title: report.classroomStudent.classroom.title,
          gradeBand: report.classroomStudent.classroom.gradeBand,
          gradeLabel: report.classroomStudent.classroom.gradeLabel,
        },
      },
      report: report.report,
    },
  };
}

export async function getTopicOverviewData(topicId: string): Promise<TopicOverviewResponse> {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const [reportCountResult, questionCountResult, activeStudentCountResult] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(studentProgressReports)
      .where(eq(studentProgressReports.topicId, topicId)),
    getDb()
      .select({ value: count() })
      .from(learningInteractions)
      .where(
        and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
          eq(learningInteractions.interactionType, "out_of_session_question"),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(classroomStudents)
      .where(
        and(
          eq(classroomStudents.classroomId, topic.classroomId),
          eq(classroomStudents.inviteStatus, "accepted"),
        ),
      ),
  ]);

  return {
    success: true as const,
    data: {
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        subject: topic.subject,
        contentLocale: toOptionalAppLocale(topic.contentLocale),
        subjectKey: topic.subjectKey,
        subjectLabel: topic.subjectLabel,
        status: topic.status,
        classroom: {
          id: topic.classroom.id,
          title: topic.classroom.title,
          gradeBand: topic.classroom.gradeBand,
          gradeLabel: topic.classroom.gradeLabel,
        },
      },
      reportCount: reportCountResult[0]?.value ?? 0,
      questionCount: questionCountResult[0]?.value ?? 0,
      activeStudentCount: activeStudentCountResult[0]?.value ?? 0,
    },
  };
}

export async function getClassroomStudentsData(classroomId: string) {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId,
  });

  if (accessResult.error === "UNAUTHORIZED") {
    throw new Error("Unauthorized");
  }

  const [students, pendingInvitations] = await Promise.all([
    getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.classroomId, accessResult.classroom.id),
      with: {
        interestProfile: true,
      },
    }),
    listPendingClassroomInvitations({ classroomId: accessResult.classroom.id }),
  ]);

  return {
    success: true as const,
    data: {
      students: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        profileLastUpdated: student.interestProfile?.profile.lastUpdated ?? null,
      })),
      pendingInvitations: pendingInvitations.map((inv) => ({
        id: inv.id,
        email: inv.invitedEmail,
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        createdAt: inv.createdAt?.toISOString() ?? null,
      })),
    },
  };
}

export async function getTeacherClassroomsData() {
  const session = await getVerifiedSession();
  const data = await ClassroomService.getTeacherClassrooms(session.user.id);
  return { success: true as const, data };
}

export async function getClassroomTopicsData(classroomId: string) {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId,
  });

  if (accessResult.error === "UNAUTHORIZED") {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: (await getDb().query.learningTopics.findMany({
      where: (table, operators) => operators.eq(table.classroomId, classroomId),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    })).map((topic) => ({
      ...topic,
      contentLocale: normalizeAppLocale(topic.contentLocale),
    })),
  };
}

export async function getTopicReportsData(topicId: string) {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const reports = await getDb().query.studentProgressReports.findMany({
    where: eq(studentProgressReports.topicId, topicId),
    with: {
      classroomStudent: true,
    },
    orderBy: (table, operators) => [operators.desc(table.updatedAt)],
  });

  const serializedReports = reports.map((report) => ({
    id: report.id,
    sessionId: report.generatedFromSessionId,
    masteryPercent: report.masteryPercent,
    sourceLocale: report.sourceLocale,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    student: {
      id: report.classroomStudent.id,
      fullName: report.classroomStudent.fullName,
      email: report.classroomStudent.email,
    },
    report: report.report,
  }));

  return {
    success: true as const,
    data: {
      reports: serializedReports,
      summary: buildClassroomTopicReportSummary(serializedReports),
    },
  };
}

export async function getTopicQuestionsData(
  topicId: string,
  classroomStudentId?: string,
) {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const interactions = await getDb().query.learningInteractions.findMany({
    where: classroomStudentId
      ? and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
          eq(learningInteractions.classroomStudentId, classroomStudentId),
        )
      : and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
        ),
    with: {
      classroomStudent: true,
    },
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
    limit: 100,
  });

  return {
    success: true as const,
    data: interactions.map((interaction) => ({
      id: interaction.id,
      createdAt: interaction.createdAt,
      role: interaction.role,
      interactionType: interaction.interactionType,
      content: interaction.content,
      metadata: interaction.metadata,
      student: {
        id: interaction.classroomStudent.id,
        fullName: interaction.classroomStudent.fullName,
        email: interaction.classroomStudent.email,
      },
    })),
  };
}

export async function getClassroomAssignedSurveysData(classroomId: string) {
  const session = await getVerifiedSession();
  const data = await ClassroomService.getClassroomSurveyProgress({
    classroomId,
    teacherUserId: session.user.id,
  });

  return {
    success: true as const,
    data,
  };
}

export async function getLearningInterventionsData(input: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}) {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId: input.classroomId,
  });

  if (accessResult.error) {
    throw new Error("Unauthorized");
  }

  const data = await InterventionService.listInterventions({
    classroomId: input.classroomId,
    topicId: input.topicId,
    classroomStudentId: input.classroomStudentId,
  });

  return {
    success: true as const,
    data,
  };
}

export async function getTopicMaterialsData(topicId: string) {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: (await getDb().query.topicMaterials.findMany({
      where: eq(topicMaterials.topicId, topicId),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    })).map((material) => ({
      ...material,
      analysis: material.analysis ?? undefined,
    })),
  };
}

export async function getTopicReadinessData(topicId: string) {
  const session = await getVerifiedSession();
  const access = await getTeacherTopicAccess(session.user.id, topicId);

  if (!access) {
    throw new Error("Unauthorized");
  }

  const topic = await getTopicWithMaterials(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  const materialAnalyses = topic.materials.map((material) => ({
    title: material.title,
    analysis: material.analysis ?? {},
    extractedTextSample: material.extractedText?.slice(0, 4000) ?? "",
  }));

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: readinessSchema,
    }),
    prompt: `You are helping a teacher decide whether a topic is ready for a grounded AI tutor.

Topic: ${topic.title}
Description: ${topic.description ?? ""}
Learning outcomes:
${topic.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Uploaded materials and analyses:
${JSON.stringify(materialAnalyses)}

Rules:
- Mark ready true only if the materials appear sufficient to support the outcomes without large factual gaps.
- Ask clarifying questions only when they are genuinely needed.
- Gaps should focus on missing source material, vague outcomes, or unsupported expectations.`,
  });

  return {
    success: true as const,
    data: output,
  };
}

export async function getOnboardingStateData() {
  const session = await getVerifiedSession();
  const state = await getOnboardingState(session.user.id);

  if (!state.membership) {
    throw new Error("Student context not found");
  }

  if (state.completed) {
    return {
      completed: true as const,
      profile: state.profile,
    };
  }

  return {
    completed: false as const,
    sessionId: state.sessionId,
    messages: state.messages,
  };
}

export async function getTutoringSessionInitialData(
  topicId: string,
  language?: string | null,
) {
  const session = await getVerifiedSession();
  const { access, studyLanguage } = await resolveStudentTutoringContext({
    userId: session.user.id,
    topicId,
    language: language ?? null,
    preferredLanguage: session.user.preferredLanguage,
  });

  if (!access) {
    throw new Error("Unauthorized");
  }

  const tutorSession = await ensureTutoringSession({
    topicId,
    access,
    studyLanguage,
  });
  const messages = await listLearningMessages(tutorSession.id);
  const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

  return {
    success: true as const,
      data: {
        sessionId: tutorSession.id,
        sessionLocale: normalizeAppLocale(tutorSession.sessionLocale),
        sourceLocale: normalizeAppLocale(access.topic.contentLocale),
        topic: {
          id: access.topic.id,
          title: access.topic.title,
          subject: access.topic.subject,
          subjectKey: access.topic.subjectKey,
          subjectLabel: access.topic.subjectLabel,
        },
        sessionState: state,
        messages: messages.map((message) => ({
          ...message,
          metadata: message.metadata ?? undefined,
        })),
      },
    };
}

export const getNotificationsForCurrentUser = cache(async (): Promise<NotificationRecord[]> => {
  const session = await getVerifiedSession();
  return getDb().query.notifications.findMany({
    where: eq(notifications.userId, session.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit: 20,
  });
});

export async function getFolderListData() {
  const session = await getVerifiedSession();

  const [folderRows, folderSurveyRows] = await Promise.all([
    getDb().query.folders.findMany({
      where: eq(folders.userId, session.user.id),
      orderBy: (table, operators) => [operators.asc(table.createdAt)],
    }),
    getDb().query.surveys.findMany({
      where: eq(surveys.userId, session.user.id),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    }),
  ]);

  const surveysByFolderId = new Map<string, FolderSurveyListItem[]>();

  for (const survey of folderSurveyRows) {
    if (!survey.folderId) {
      continue;
    }

    const folderSurveys = surveysByFolderId.get(survey.folderId) ?? [];
    folderSurveys.push({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      currentParticipants: survey.currentParticipants,
      isVoice: survey.isVoice,
      createdAt: survey.createdAt,
      folderId: survey.folderId,
    });
    surveysByFolderId.set(survey.folderId, folderSurveys);
  }

  return folderRows.map((folder) => {
    const folderSurveys = surveysByFolderId.get(folder.id) ?? [];
    return {
      ...folder,
      surveyCount: folderSurveys.length,
      totalResponses: folderSurveys.reduce(
        (sum, survey) => sum + survey.currentParticipants,
        0,
      ),
      canEditMetadata: true as const,
      canOrganizeSurveys: true as const,
      canDelete: true as const,
      isSharedFolder: false as const,
      surveys: folderSurveys,
    };
  });
}

export async function getFolderDetailData(folderId: string) {
  const session = await getVerifiedSession();

  const [folder, folderSurveys] = await Promise.all([
    getDb().query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, session.user.id)),
    }),
    getDb().query.surveys.findMany({
      where: and(eq(surveys.folderId, folderId), eq(surveys.userId, session.user.id)),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    }),
  ]);

  if (!folder) {
    throw new Error("Folder not found");
  }

  const completedCounts = folderSurveys.length
    ? await getDb()
        .select({
          surveyId: surveyConversations.surveyId,
          value: count(),
        })
        .from(surveyConversations)
        .where(
          and(
            inArray(
              surveyConversations.surveyId,
              folderSurveys.map((survey) => survey.id),
            ),
            eq(surveyConversations.completed, true),
          ),
        )
        .groupBy(surveyConversations.surveyId)
    : [];

  const completedCountBySurveyId = new Map(
    completedCounts.map((row) => [row.surveyId, row.value]),
  );

  return {
    ...folder,
    canEditMetadata: true as const,
    canOrganizeSurveys: true as const,
    canDelete: true as const,
    isSharedFolder: false as const,
    surveys: folderSurveys.map<FolderDetailSurveyItem>((survey) => ({
      ...survey,
      summary: null,
      completedCount: Number(completedCountBySurveyId.get(survey.id) ?? 0),
    })),
  };
}

export async function getAvailableFolderSurveysData() {
  const session = await getVerifiedSession();

  return getDb().query.surveys.findMany({
    where: and(eq(surveys.userId, session.user.id), isNull(surveys.folderId)),
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
  });
}

export const getCurrentUiLocaleValue = cache(async () => {
  const session = await getCurrentSession();
  return normalizeAppLocale(session?.user.uiLocale ?? session?.user.preferredLanguage);
});

export async function getTeacherLearningWorkspaceInitialData() {
  const initialClassrooms = await getTeacherClassroomsData();
  const initialClassroomId = initialClassrooms.data[0]?.id ?? null;

  const [initialStudents, initialTopics, initialAssignedSurveys] = initialClassroomId
    ? await Promise.all([
        getClassroomStudentsData(initialClassroomId),
        getClassroomTopicsData(initialClassroomId),
        getClassroomAssignedSurveysData(initialClassroomId),
      ])
    : [undefined, undefined, undefined];

  const initialClassroomStudentId = initialStudents?.data.students[0]?.id ?? null;
  const initialTopicId = initialTopics?.data[0]?.id ?? null;

  const [
    initialMaterials,
    initialReadiness,
    initialReportsPayload,
    initialQuestions,
    initialClassroomStudentPatterns,
    initialInterventions,
  ] = await Promise.all([
    initialTopicId ? getTopicMaterialsData(initialTopicId) : Promise.resolve(undefined),
    initialTopicId ? getTopicReadinessData(initialTopicId) : Promise.resolve(undefined),
    initialTopicId ? getTopicReportsData(initialTopicId) : Promise.resolve(undefined),
    initialTopicId ? getTopicQuestionsData(initialTopicId) : Promise.resolve(undefined),
    initialClassroomStudentId
      ? getClassroomStudentPatternData(initialClassroomStudentId)
      : Promise.resolve(undefined),
    initialClassroomId && initialClassroomStudentId
      ? getLearningInterventionsData({
          classroomId: initialClassroomId,
          classroomStudentId: initialClassroomStudentId,
          topicId: initialTopicId ?? undefined,
        })
      : Promise.resolve(undefined),
  ]);

  return {
    initialClassrooms,
    initialStudents,
    initialTopics,
    initialAssignedSurveys,
    initialMaterials,
    initialReadiness,
    initialReportsPayload,
    initialQuestions,
    initialClassroomStudentPatterns,
    initialInterventions,
  };
}

export async function getStudentLearningWorkspaceInitialData(options: {
  classroomId?: string | null;
  language?: string | null;
} = {}) {
  const learningMe = await getLearningMeData();
  if (learningMe.role !== "student") {
    return {
      learningMe,
      initialPatterns: undefined,
      initialOnboardingState: undefined,
      initialTutoringSession: undefined,
    };
  }

  const selectedMembership =
    (options.classroomId
      ? learningMe.student.find(
          (membership) => membership.classroom.id === options.classroomId,
        )
      : null) ??
    learningMe.student[0] ??
    null;

  const initialTopicId = selectedMembership?.topics[0]?.id ?? null;
  const [initialPatterns, initialOnboardingState, initialTutoringSession] =
    await Promise.all([
      getMyPatternSummaries(),
      selectedMembership?.needsOnboarding
        ? getOnboardingStateData()
        : Promise.resolve(undefined),
      selectedMembership && !selectedMembership.needsOnboarding && initialTopicId
        ? getTutoringSessionInitialData(initialTopicId, options.language)
        : Promise.resolve(undefined),
    ]);

  return {
    learningMe,
    initialPatterns,
    initialOnboardingState,
    initialTutoringSession,
  };
}

export async function getSurveyListData(): Promise<SurveyListItem[]> {
  const session = await getVerifiedSession();
  return (await listSurveysForUser(session.user.id)) as SurveyListItem[];
}

export async function getSurveyDetailsData(surveyId: string): Promise<SurveyDetailsResponse> {
  const session = await getVerifiedSession();

  const [survey, briefRow] = await Promise.all([
    getDb().query.surveys.findFirst({
      where: eq(surveys.id, surveyId),
      with: {
        classroom: {
          columns: {
            title: true,
          },
        },
      },
    }),
    getDb()
      .select()
      .from(surveyBriefs)
      .where(eq(surveyBriefs.surveyId, surveyId))
      .then((rows) => rows[0]),
  ]);

  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, survey.id);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [stats, completedStats, recentResponses, durationStats] = await Promise.all([
    getDb()
      .select({
        totalResponses: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${surveyConversations.rawConversation}) as msg 
            WHERE msg->>'role' = 'user'
          )`,
        ),
      )
      .then((rows) => rows[0]),
    getDb()
      .select({
        count: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
        ),
      )
      .then((rows) => rows[0]),
    getDb()
      .select({
        id: surveyConversations.id,
        participantId: surveyConversations.participantId,
        completed: surveyConversations.completed,
        createdAt: surveyConversations.createdAt,
        updatedAt: surveyConversations.updatedAt,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId))
      .orderBy(desc(surveyConversations.createdAt))
      .limit(10),
    getDb()
      .select({
        avgDuration: sql<number>`avg(${surveyConversations.durationMs})`,
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
          sql`${surveyConversations.durationMs} > 0`,
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const totalResponses = stats?.totalResponses || 0;
  const completedResponses = completedStats?.count || 0;
  const completionRate =
    totalResponses > 0
      ? Math.round((completedResponses / totalResponses) * 100)
      : 0;

  const avgDurationMs = Math.round(Number(durationStats?.avgDuration) || 0);
  let avgDurationDisplay = "0 min";
  if (avgDurationMs > 0) {
    if (avgDurationMs < 60000) {
      avgDurationDisplay = `${Math.round(avgDurationMs / 1000)}s`;
    } else {
      const minutes = Math.round(avgDurationMs / 60000);
      avgDurationDisplay = minutes === 0 ? "< 1 min" : `${minutes} min`;
    }
  }

  const publicIdentifier = survey.customSlug ?? survey.shareableLink;
  const shareableUrl = publicIdentifier
    ? `${env.APP_BASE_URL}/s/${publicIdentifier}`
    : null;

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      description: survey.description,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
      coreObjective: survey.coreObjective,
      programId: survey.programId,
      brief: briefRow?.brief || null,
      tone: survey.tone,
      customSlug: survey.customSlug,
      shareableLink: survey.shareableLink,
      shareableUrl,
      participantLimit: survey.participantLimit,
      currentParticipants: survey.currentParticipants,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics,
      language: survey.language,
      isVoice: survey.isVoice,
      media: survey.media,
      sampleConversationCount: survey.sampleConversationCount,
      userId: survey.userId,
      deliveryMode: survey.deliveryMode as "link" | "classroom_assigned",
      classroomId: survey.classroomId,
      classroomTitle: survey.classroom?.title ?? null,
      editors: [],
      permission,
    },
    stats: {
      totalResponses,
      completedResponses,
      completionRate,
      avgDuration: avgDurationDisplay,
    },
    recentResponses: recentResponses.map((response) => ({
      id: response.id,
      participantId: response.participantId,
      completed: response.completed,
      completedAt: response.completed ? response.updatedAt?.toISOString() : null,
      createdAt: response.createdAt?.toISOString(),
    })),
  };
}

export async function getSurveyResponseDetailData(
  surveyId: string,
  responseId: string,
): Promise<AnalyticsSessionDetail> {
  const session = await getVerifiedSession();

  const [survey] = await getDb()
    .select({
      id: surveys.id,
      title: surveys.title,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, surveyId);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [sessionRow] = await getDb()
    .select()
    .from(surveySessions)
    .where(
      and(
        eq(surveySessions.surveyId, surveyId),
        or(
          eq(surveySessions.id, responseId),
          eq(surveySessions.sourceConversationId, responseId),
        ),
      ),
    );

  if (!sessionRow) {
    throw new Error("Response not found");
  }

  const [insightRow, turnRows, evidenceRows, activePlan] = await Promise.all([
    getDb()
      .select()
      .from(surveySessionInsights)
      .where(eq(surveySessionInsights.sessionId, sessionRow.id))
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(surveyTurns)
      .where(eq(surveyTurns.sessionId, sessionRow.id)),
    getDb()
      .select()
      .from(surveyEvidence)
      .where(eq(surveyEvidence.sessionId, sessionRow.id)),
    getDb()
      .select()
      .from(surveyCoveragePlans)
      .where(
        and(
          eq(surveyCoveragePlans.surveyId, surveyId),
          eq(surveyCoveragePlans.isActive, true),
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const insightResult = conversationInsightSchema.safeParse(insightRow?.insight);
  const insight: ConversationInsight | undefined = insightResult.success
    ? insightResult.data
    : undefined;
  const nodeCoverageMap = sessionRow.sessionState.coverageByNode || {};
  const planNodes = activePlan?.plan.nodes || [];
  const evidence = evidenceRows
    .map((row) => evidenceRecordSchema.safeParse(row.metadata))
    .filter((result): result is { success: true; data: EvidenceRecord } => result.success)
    .map((result) => result.data);

  return {
    id: sessionRow.id,
    surveyId: survey.id,
    surveyTitle: survey.title,
    sessionType: sessionRow.sessionType,
    sourceConversationId: sessionRow.sourceConversationId,
    startedAt: sessionRow.createdAt.toISOString(),
    completedAt: sessionRow.completedAt?.toISOString() ?? null,
    status: sessionRow.sessionStatus,
    summary:
      insight?.summary ||
      sessionRow.summary ||
      "No session summary is available yet.",
    keyFindings: Array.isArray(insight?.keyFindings) ? insight.keyFindings : [],
    risks: Array.isArray(insight?.risks) ? insight.risks : [],
    reliabilityPercent: Math.round(
      (sessionRow.sessionState.reliabilityScore || 0) * 100,
    ),
    completenessPercent: Math.round(
      (sessionRow.sessionState.overallCoverage || 0) * 100,
    ),
    fatiguePercent: Math.round(
      (sessionRow.sessionState.fatigueScore || 0) * 100,
    ),
    nodeCoverage: planNodes.map((node: CoverageNode) => ({
      id: node.id,
      label: node.label,
      description: node.description,
      coveragePercent: Math.round((nodeCoverageMap[node.id] || 0) * 100),
    })),
    notableQuotes: Array.isArray(insight?.notableQuotes) ? insight.notableQuotes : [],
    evidence,
    transcript: turnRows
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .map((turn) => ({
        id: turn.id,
        role: turn.role,
        content: turn.content,
      })),
  };
}

export async function getSurveyCreationInitialData(surveyId: string) {
  const session = await getVerifiedSession();
  const permission = await getSurveyPermissionForSession(session, surveyId);

  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [survey, creationConversation] = await Promise.all([
    getDb()
      .select({
        id: surveys.id,
        status: surveys.status,
        language: surveys.language,
        isVoice: surveys.isVoice,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId))
      .then((rows) => rows[0]),
  ]);

  if (!survey) {
    throw new Error("Survey not found");
  }

  return {
    surveyId,
    status: survey.status,
    language: survey.language,
    isVoice: survey.isVoice,
    permission,
    messages: creationConversation?.messages || [],
    collectedInfo: creationConversation?.collectedInfo || {},
    extractedData: creationConversation?.extractedData || {},
  };
}

export async function getSampleConversationInitialData(
  surveyId: string,
  conversationNumber: number,
) {
  const session = await getVerifiedSession();

  const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, survey.id);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [sample] = await getDb()
    .select()
    .from(sampleConversations)
    .where(
      and(
        eq(sampleConversations.surveyId, surveyId),
        eq(sampleConversations.conversationNumber, conversationNumber),
      ),
    )
    .limit(1);

  return {
    messages: toVisibleConversationMessages(
      toPersistedUIChatMessages(sample?.messages ?? [], ["user", "assistant"]),
    ),
  };
}

export async function getSurveyAnalyticsInitialData(
  surveyId: string,
  language: string | null,
): Promise<SurveyAnalyticsData | AnalyticsPendingData> {
  const session = await getVerifiedSession();
  const response = await getSurveyAnalyticsViewModel({
    surveyId,
    session,
    language,
  });

  if (!response.ok) {
    let message = "Failed to load analytics";

    try {
      const payload = await response.json();
      if (payload && typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parsing failures and use the fallback message.
    }

    throw new Error(message);
  }

  return (await response.json()) as SurveyAnalyticsData | AnalyticsPendingData;
}
