import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { isExpertRole } from "@/lib/auth/roles";
import { listExpertReviewQueue } from "@/lib/learning/storage";
import { apiUnhandledError } from "@/lib/api/error-contract";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    if (!isExpertRole(session.user)) {
      throw new Error("Unauthorized: Expert or admin access required");
    }

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
