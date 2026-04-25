import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { listLearningMessages } from "@/lib/learning/storage";

export async function GET(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);

    const { sessionId } = await props.params;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const messages = await listLearningMessages(sessionId);

    return NextResponse.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session transcript" },
      { status: 400 },
    );
  }
}
