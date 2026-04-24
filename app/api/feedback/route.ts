import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: 401 },
    );
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
    const message =
      error instanceof Error ? error.message : "Failed to submit feedback";
    const status =
      message === "UNAUTHENTICATED" || message === "EMAIL_NOT_VERIFIED"
        ? 401
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
