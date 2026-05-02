import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/session";
import { createPrivacyRequest } from "@/lib/privacy/service";

const bodySchema = z.object({
  scope: z.enum(["user"]).default("user"),
  requestType: z.enum([
    "rectification",
    "restriction",
    "objection",
  ]),
  details: z.string().trim().max(4000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = bodySchema.parse(await request.json());

    const privacyRequest = await createPrivacyRequest({
      userId: session.user.id,
      subjectType: "user",
      requestType: body.requestType,
      requestPayload: {
        details: body.details ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Invalid request body",
      );
    }

    return apiUnhandledError(error, "Failed to create privacy request", "/api/privacy/request");
  }
}
