import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { listExpertReviewQueue } from "@/lib/learning/storage";
import { apiUnhandledError } from "@/lib/api/error-contract";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);

    const queue = await listExpertReviewQueue({
      teacherUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load review queue", "expert-review-queue");
  }
}
