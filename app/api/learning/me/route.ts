import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getLearningMeDataForSession } from "@/lib/server/app-queries";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    return NextResponse.json(await getLearningMeDataForSession(session));
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load student context", "/api/learning/me");
  }
}
