import { NextResponse } from "next/server";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { listExpertFrameworkCourseSummaries } from "@/lib/learning/expert-framework-summaries";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET() {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const summaries = await listExpertFrameworkCourseSummaries();

    return NextResponse.json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load framework course summaries",
      "expert-frameworks:get",
    );
  }
}
