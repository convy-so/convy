import { NextResponse } from "next/server";

import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { listStudentMemberships } from "@/lib/learning/access";
import { listPendingInvitationsForUser } from "@/lib/learning/student-service";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const [memberships, invitations] = await Promise.all([
      listStudentMemberships(session.user.id),
      listPendingInvitationsForUser(session.user.id),
    ]);

    if (memberships.length === 0) {
      return NextResponse.json({
        role: session.user.role === "student" ? "student" : "non-student",
        student: session.user.role === "student" ? [] : null,
        invitations: invitations.map((invitation) => ({
          id: invitation.id,
          classroomId: invitation.classroomId,
          classroomTitle: invitation.classroom?.title ?? "Classroom",
          invitedEmail: invitation.invitedEmail,
          status: invitation.status,
          expiresAt: invitation.expiresAt?.toISOString() ?? null,
        })),
      });
    }

    return NextResponse.json({
      role: "student",
      student: await Promise.all(
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
              const responseStatus = latestConversation?.completed
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
      ),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        classroomId: invitation.classroomId,
        classroomTitle: invitation.classroom?.title ?? "Classroom",
        invitedEmail: invitation.invitedEmail,
        status: invitation.status,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load student context", "/api/learning/me");
  }
}
