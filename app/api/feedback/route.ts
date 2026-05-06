import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import {
  resolveFeedbackFormContext,
  submitPlatformFeedback,
} from "@/lib/feedback/service";

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const context = await resolveFeedbackFormContext(session.user);

    return NextResponse.json({
      success: true,
      data: context,
    });
  } catch (error) {
    return apiUnhandledError(error, "Unauthorized", "/api/feedback");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();
    const created = await submitPlatformFeedback(session.user, body);

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        status: created.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit feedback";
    const isAuthError = message === "UNAUTHENTICATED" || message === "EMAIL_NOT_VERIFIED";
    
    if (isAuthError) {
        return apiError("UNAUTHENTICATED", message);
    }
    
    return apiUnhandledError(error, "Failed to submit feedback", "/api/feedback");
  }
}
