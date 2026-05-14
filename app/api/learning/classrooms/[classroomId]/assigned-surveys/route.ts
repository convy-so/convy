import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import * as ClassroomService from "@/lib/learning/classroom-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const data = await ClassroomService.getClassroomSurveyProgress({
      classroomId,
      teacherUserId: session.user.id,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Failed to get survey progress",
    );
  }
}
