import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { toApiAuthError } from "@/features/auth/public-server";
import { isTransientDatabaseError } from "@/shared/db/transient-database-errors";
import * as ClassroomService from "@/features/tutoring/server/classroom-service";

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
