import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { createLearningTopicAction } from "@/app/actions/classroom";
import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/dal";
import { resolveTeacherClassroomAccess } from "@/lib/learning/teacher-route-access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const accessResult = await resolveTeacherClassroomAccess({
      teacherUserId: session.user.id,
      classroomId,
    });

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const { classroom } = accessResult;

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
    return handleLearningRouteError(error, "Failed to load topics", "/api/learning/classrooms/[classroomId]/topics");
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
