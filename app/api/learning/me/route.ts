import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/session";
import { listStudentMemberships } from "@/lib/learning/access";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const memberships = await listStudentMemberships(session.user.id);

    if (memberships.length === 0) {
      return NextResponse.json({
        role: "non-student",
        student: null,
      });
    }

    return NextResponse.json({
      role: "student",
      student: await Promise.all(
        memberships.map(async (membership) => {
          const topics = await getDb().query.learningTopics.findMany({
            where: (table, { and, eq }) =>
              and(
                eq(table.classroomId, membership.classroomId),
                eq(table.status, "active"),
              ),
          });
          const classroomSurveys = await getDb().query.surveys.findMany({
            where: (table, { and, eq, isNotNull }) =>
              and(
                eq(table.classroomId, membership.classroomId),
                eq(table.deliveryMode, "classroom_assigned"),
                eq(table.status, "active"),
                isNotNull(table.shareableLink),
              ),
            orderBy: (table, { desc }) => [desc(table.updatedAt)],
          });

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
            surveys: classroomSurveys.flatMap((survey) =>
              survey.shareableLink
                ? [
                    {
                      id: survey.id,
                      title: survey.title,
                      status: survey.status,
                      isVoice: survey.isVoice,
                      shareableLink: survey.shareableLink,
                      createdAt: survey.createdAt?.toISOString() ?? null,
                    },
                  ]
                : [],
            ),
          };
        }),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load student context",
      },
      { status: 400 },
    );
  }
}
