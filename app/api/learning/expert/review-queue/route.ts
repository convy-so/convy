import { NextResponse } from "next/server";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { listExpertReviewQueue } from "@/lib/learning/storage";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET() {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;

    const queue = await listExpertReviewQueue();

    return NextResponse.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load review queue", "expert-review-queue");
  }
}
