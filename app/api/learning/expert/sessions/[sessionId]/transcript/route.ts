import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { listLearningMessages } from "@/lib/learning/storage";

export async function GET(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;

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
    return handleLearningRouteError(error, "Failed to load session transcript", "/api/learning/expert/sessions/[sessionId]/transcript");
  }
}
