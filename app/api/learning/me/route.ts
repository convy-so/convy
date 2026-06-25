import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getLearningMeDataForSession } from "@/shared/http/page-data";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    return NextResponse.json(await getLearningMeDataForSession(session));
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load student context", "/api/learning/me");
  }
}
