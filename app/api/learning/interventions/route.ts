import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import * as InterventionService from "@/lib/learning/intervention-service";
import { resolveTeacherClassroomAccess } from "@/lib/learning/teacher-route-access";

export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get("classroomId");
    const topicId = searchParams.get("topicId") ?? undefined;
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
      topicId,
      classroomStudentId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load interventions", "/api/learning/interventions");
  }
}
