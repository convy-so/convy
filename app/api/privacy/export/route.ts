import { NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/session";
import {
  createPrivacyRequest,
  exportUserPrivacyData,
  markPrivacyRequestResolved,
} from "@/lib/privacy/service";

const bodySchema = z.object({
  scope: z.enum(["user"]).default("user"),
});

export async function POST(request: Request) {
  let privacyRequestId: string | null = null;

  try {
    const session = await getVerifiedSession();
    const body = bodySchema.parse(await request.json());

    const privacyRequest = await createPrivacyRequest({
      userId: session.user.id,
      subjectType: body.scope,
      requestType: "export",
      requestPayload: body,
    });
    privacyRequestId = privacyRequest.id;

    const payload = await exportUserPrivacyData(session.user.id);

    await markPrivacyRequestResolved({
      requestId: privacyRequest.id,
      status: "completed",
      resultPayload: {
        scope: body.scope,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
      data: payload,
    });
  } catch (error) {
    if (privacyRequestId) {
      await markPrivacyRequestResolved({
        requestId: privacyRequestId,
        status: "failed",
        resultPayload: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }).catch(() => undefined);
    }

    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Failed to export privacy data" }, { status: 400 });
  }
}
