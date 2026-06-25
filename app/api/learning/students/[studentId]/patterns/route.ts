import { NextResponse } from "next/server";

import { getDb } from "@/shared/db";
import { getVerifiedSession } from "@/features/auth/public-server";
import { apiError } from "@/shared/http/api-error";
import { summarizeStudentPatternMemory } from "@/features/tutoring/server/pattern-memory-service";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";
import { resolveTeacherStudentAccess } from "@/features/tutoring/server/teacher-route-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId: classroomStudentId } = await params;

    const accessResult = await resolveTeacherStudentAccess({
      teacherUserId: session.user.id,
      classroomStudentId,
    });

    if (accessResult.error === "NOT_FOUND") {
      return apiError("NOT_FOUND", "Student not found");
    }

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, classroomStudentId),
      with: {
        classroom: true,
      },
    });

    if (!membership) {
      return apiError("NOT_FOUND", "Student not found");
    }

    const summary = membership.userId
      ? await summarizeStudentPatternMemory({
          studentUserId: membership.userId,
        })
      : {
          profiles: [],
          memoryState: {
            status: "unavailable" as const,
            message:
              "This student does not have a connected account for long-horizon learning memory yet.",
          },
        };

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: membership.id,
          fullName: membership.fullName,
          email: membership.email,
        },
        profiles: summary.profiles,
        memoryState: summary.memoryState,
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load learning memory",
      "/api/learning/students/[studentId]/patterns",
    );
  }
}
