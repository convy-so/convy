import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import { isExpert } from "@/lib/auth/dal";
import { listLearningMessages } from "@/lib/learning/storage";

export async function GET(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    if (!isExpert(session.user)) {
      return apiError("UNAUTHORIZED", "Expert or admin access required");
    }

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
