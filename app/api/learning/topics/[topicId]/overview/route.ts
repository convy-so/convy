import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { classroomStudents, learningInteractions, studentProgressReports } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherTopicAccess } from "@/lib/learning/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

    return NextResponse.json({
      success: true,
      data: {
        topic: {
          id: topic.id,
          title: topic.title,
          description: topic.description,
          subject: topic.subject,
          contentLocale: topic.contentLocale,
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
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load topic overview" },
      { status: 400 },
    );
  }
}
