import { NextResponse } from "next/server";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { listExpertFrameworkCourseSummaries } from "@/features/tutoring/server/expert-framework-summaries";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

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
    return handleTutoringRouteError(
      error,
      "Failed to load framework course summaries",
      "expert-frameworks:get",
    );
  }
}
