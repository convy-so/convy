import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveyConversations } from "@/shared/db/schema";
import {
  getVerifiedSession,
  requirePlatformRole,
} from "@/features/auth/public-server";
import {
  getUniversalStudentInterestProfile,
  listStudentMemberships,
} from "@/features/tutoring/server/access";
import { getOnboardingState } from "@/features/tutoring/server/onboarding-route-service";
import { summarizeStudentPatternMemory } from "@/features/tutoring/server/pattern-memory-service";
import {
  ensureTutoringSession,
  getStudentTutoringAccessFailureMessage,
  resolveStudentTutoringContext,
} from "@/features/tutoring/server/tutoring-route-orchestrator";
import {
  listPendingInvitationsForUser,
} from "@/features/tutoring/server/student-service";
import {
  learningSessionStateSchema,
  listLearningMessages,
} from "@/features/tutoring/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import type { LearningMeData } from "@/features/tutoring/public-client";
import type { QueryAuthContext, VerifiedSession } from "@/shared/http/page-data/page-data-context";
import { resolveQuerySession } from "@/shared/http/page-data/page-data-context";

export async function getLearningMeDataForSession(
  session: VerifiedSession,
): Promise<LearningMeData> {
  const sessionRole = requirePlatformRole(session.user);
  const [memberships, invitations] = await Promise.all([
    listStudentMemberships(session.user.id),
    listPendingInvitationsForUser(session.user.id),
  ]);
  const universalInterestProfile = memberships.length
    ? await getUniversalStudentInterestProfile(session.user.id)
    : null;

  if (memberships.length === 0) {
    const learnerPersona = sessionRole === "student";
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
          with: {
            course: true,
          },
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
        needsOnboarding: !universalInterestProfile,
        profileLastUpdated: universalInterestProfile?.profile.lastUpdated ?? null,
        topics: topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          description: topic.description,
          courseId: topic.courseId,
          courseTitle: topic.course.title,
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
              latestActivityAt: latestConversation?.updatedAt.toISOString() ?? null,
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
}

export const getLearningMeData = cache(async (): Promise<LearningMeData> => {
  return getLearningMeDataForSession(await getVerifiedSession());
});

async function getMyPatternSummariesForSession(session: VerifiedSession) {
  const summary = await summarizeStudentPatternMemory({
    studentUserId: session.user.id,
  });
  return {
    success: true as const,
    data: {
      profiles: summary.profiles,
      memoryState: summary.memoryState,
    },
  };
}

export const getMyPatternSummaries = cache(async () => {
  return getMyPatternSummariesForSession(await getVerifiedSession());
});

export async function getOnboardingStateData(authContext?: QueryAuthContext) {
  const session = await resolveQuerySession(authContext);
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
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const { access, deniedReason, studyLanguage } =
    await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
      language: language ?? null,
      preferredLanguage: session.user.preferredLanguage,
    });

  if (!access && deniedReason) {
    throw new Error(getStudentTutoringAccessFailureMessage(deniedReason));
  }
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
      lesson: {
        id: access.topic.id,
        title: access.topic.title,
        courseId: access.topic.courseId,
        courseTitle: access.topic.course.title,
      },
      sessionState: state,
      messages: messages.map((message) => ({
        ...message,
        metadata: message.metadata ?? undefined,
      })),
    },
  };
}

export async function getStudentLearningWorkspaceInitialData(
  options: {
    classroomId: string;
    lessonId: string;
    language?: string | null;
  },
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const learningMe = await getLearningMeDataForSession(session);
  if (learningMe.role !== "student") {
    return {
      learningMe,
      initialPatterns: undefined,
      initialTutoringSession: undefined,
    };
  }

  const selectedMembership =
    learningMe.student.find(
      (membership) => membership.classroom.id === options.classroomId,
    ) ?? null;

  if (!selectedMembership) {
    throw new Error("Classroom not found.");
  }

  const selectedLesson =
    selectedMembership.topics.find((topic) => topic.id === options.lessonId) ?? null;

  if (!selectedLesson) {
    throw new Error("Lesson not found.");
  }

  const [initialPatterns, initialTutoringSession] = await Promise.all([
    getMyPatternSummariesForSession(session),
    !selectedMembership.needsOnboarding
      ? getTutoringSessionInitialData(
          options.lessonId,
          options.language,
          { session },
        ).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  return {
    learningMe,
    initialPatterns,
    initialTutoringSession,
  };
}
