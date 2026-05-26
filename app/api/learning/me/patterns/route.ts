import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { summarizeStudentPatternMemory } from "@/lib/learning/pattern-memory-service";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const summary = await summarizeStudentPatternMemory({
      studentUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        profiles: summary.profiles,
        memoryState: summary.memoryState,
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load learning memory summaries",
      "/api/learning/me/patterns",
    );
  }
}
