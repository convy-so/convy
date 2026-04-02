import { eq } from "drizzle-orm";
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
      getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.topicId, topicId),
      }),
      getDb().query.learningInteractions.findMany({
        where: eq(learningInteractions.topicId, topicId),
      }),
      getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.classroomId, topic.classroomId),
      }),
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
        reportCount: reportCountResult.length,
        questionCount: questionCountResult.filter(
          (item) =>
            item.interactionType === "out_of_session_question" ||
            item.interactionType === "student_question",
        ).length,
        activeStudentCount: activeStudentCountResult.filter(
          (student) => student.inviteStatus === "accepted",
        ).length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load topic overview" },
      { status: 400 },
    );
  }
}
