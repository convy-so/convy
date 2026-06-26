import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getStudentMeDataForSession } from "@/shared/http/page-data";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    return NextResponse.json(await getStudentMeDataForSession(session));
  } catch (error) {
    return handleTutoringRouteError(error, "Failed to load student context", "/api/students/me");
  }
}

