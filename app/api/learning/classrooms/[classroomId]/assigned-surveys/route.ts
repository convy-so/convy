import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import { toApiAuthError } from "@/lib/auth/error-map";
import { isTransientDatabaseError } from "@/lib/db/errors";
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
    const authError = toApiAuthError(error);
    if (authError) return authError;

    if (isTransientDatabaseError(error)) {
      console.warn("[learning] assigned survey progress unavailable", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ success: true, data: [] });
    }

    return apiError(
      "INTERNAL_ERROR",
      "Failed to get survey progress",
    );
  }
}
