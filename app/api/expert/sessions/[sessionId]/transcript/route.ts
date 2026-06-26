import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { listStudentSessionMessages } from "@/features/tutoring/public-server";

export async function GET(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const { sessionId } = await props.params;

    if (!sessionId) {
      return apiError("VALIDATION_ERROR", "Session ID is required");
    }

    const messages = await listStudentSessionMessages(sessionId);

    return NextResponse.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    return handleTutoringRouteError(error, "Failed to load session transcript", "/api/expert/sessions/[sessionId]/transcript");
  }
}

