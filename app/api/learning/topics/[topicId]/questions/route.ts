import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { learningInteractions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const url = new URL(request.url);
    const classroomStudentId =
      url.searchParams.get("classroomStudentId") ?? url.searchParams.get("studentId");

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
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    });

    return NextResponse.json({
      success: true,
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
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load questions",
      "/api/learning/topics/[topicId]/questions:get",
    );
  }
}
