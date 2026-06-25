import { NextResponse } from "next/server";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { listExpertReviewQueue } from "@/features/tutoring/public-server";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";

export async function GET() {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const queue = await listExpertReviewQueue();

    return NextResponse.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load review queue", "expert-review-queue");
  }
}
