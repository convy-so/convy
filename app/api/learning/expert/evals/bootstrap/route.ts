import { NextResponse } from "next/server";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { bootstrapExpertEvalDatasets } from "@/lib/learning/expert-eval-storage";

export async function POST() {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const datasets = await bootstrapExpertEvalDatasets();

    return NextResponse.json({
      success: true,
      data: datasets,
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to bootstrap tutoring eval datasets", "/api/learning/expert/evals/bootstrap");
  }
}
