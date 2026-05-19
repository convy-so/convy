import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import { toApiAuthError } from "@/lib/auth/error-map";
import * as ClassroomService from "@/lib/learning/classroom-service";

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
