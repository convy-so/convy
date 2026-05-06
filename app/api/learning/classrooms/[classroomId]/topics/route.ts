import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { createLearningTopicAction } from "@/app/actions/classroom";
import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const classroom = await getTeacherClassroomAccess(session.user.id, classroomId);

    if (!classroom) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const topics = await getDb().query.learningTopics.findMany({
      where: (table, { eq }) => eq(table.classroomId, classroom.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: topics.map((topic) => ({
        ...topic,
        subjectKey: topic.subjectKey,
        subjectLabel: topic.subjectLabel,
      })),
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load topics", "/api/learning/classrooms/[classroomId]/topics");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const body = await request.json();
  const { classroomId } = await params;
  const result = await createLearningTopicAction({
    classroomId,
    title: body.title,
    description: body.description,
    subject: body.subject,
    subjectKey: body.subjectKey,
    subjectLabel: body.subjectLabel,
    learningOutcomes: body.learningOutcomes,
    sourceBoundary: body.sourceBoundary,
    contentLocale: body.contentLocale,
  });
  if (!result.success) return apiError("VALIDATION_ERROR", result.error.message || "Failed to create topic", { details: result.error.details });
  return NextResponse.json(result);
}
