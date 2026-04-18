import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { listExpertReviewQueue } from "@/lib/learning/storage";
import { getTeachingContext } from "@/lib/teaching-context";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const context = await getTeachingContext();

    if (!context.organizationId) {
      return NextResponse.json({ error: "Workspace required" }, { status: 400 });
    }

    const queue = await listExpertReviewQueue({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load review queue" },
      { status: 400 },
    );
  }
}
