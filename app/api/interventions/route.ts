import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import * as InterventionService from "@/features/tutoring/server/intervention-service";
import { resolveTeacherClassroomAccess } from "@/features/tutoring/server/teacher-route-access";

export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get("classroomId");
    const lessonId = searchParams.get("lessonId") ?? undefined;
    const classroomStudentId =
      searchParams.get("classroomStudentId") ?? undefined;

    if (!classroomId) {
      return apiError("VALIDATION_ERROR", "classroomId is required");
    }

    const accessResult = await resolveTeacherClassroomAccess({
      teacherUserId: session.user.id,
      classroomId,
    });
    if (accessResult.error) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const data = await InterventionService.listInterventions({
      classroomId,
      lessonId,
      classroomStudentId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load interventions", "/api/interventions");
  }
}

