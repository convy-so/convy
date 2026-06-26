import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { classroomStudents } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { resolveTeacherClassroomAccess } from "@/features/tutoring/server/teacher-route-access";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

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

    const students = await getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.classroomId, classroom.id),
      with: {
        interestProfile: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        profileLastUpdated: student.interestProfile?.profile.lastUpdated ?? null,
      })),
    });
  } catch (error) {
    return handleTutoringRouteError(error, "Failed to load students", "/api/classrooms/[classroomId]/students");
  }
}

