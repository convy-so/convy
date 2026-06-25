import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { toApiAuthError } from "@/features/auth/public-server";
import * as ClassroomService from "@/features/tutoring/server/classroom-service";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const data = await ClassroomService.getTeacherClassrooms(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const authError = toApiAuthError(error);
    if (authError) return authError;

    return apiError(
      "INTERNAL_ERROR",
      "Failed to fetch classrooms",
    );
  }
}
