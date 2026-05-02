import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

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
      return apiError("VALIDATION_ERROR", "Session ID is required");
    }

    const messages = await listLearningMessages(sessionId);

    return NextResponse.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load session transcript", "/api/learning/expert/sessions/[sessionId]/transcript");
  }
}
