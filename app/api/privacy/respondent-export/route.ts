import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

import { createPrivacyRequest, exportRespondentPrivacyData, markPrivacyRequestResolved } from "@/features/privacy/public-server";
import { resolveRespondentAccess } from "@/features/privacy/public-server";
import { getClientIP } from "@/shared/security/client-ip";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  respondentToken: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  let privacyRequestId: string | null = null;

  try {
    const body = bodySchema.parse(await request.json());
    const tokenRecord = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId: body.surveyId,
      conversationId: body.conversationId,
      explicitToken: body.respondentToken ?? null,
      sessionAllowedScopes: ["respondent_session"],
      explicitAllowedScopes: [
        "respondent_resume",
        "respondent_self_service",
        "respondent_session",
      ],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!tokenRecord) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const privacyRequest = await createPrivacyRequest({
      surveyId: body.surveyId,
      subjectType: "respondent",
      requestType: "respondent_export",
      requestPayload: {
        conversationId: body.conversationId,
      },
    });
    privacyRequestId = privacyRequest.id;

    const payload = await exportRespondentPrivacyData(body.conversationId);
    await markPrivacyRequestResolved({
      requestId: privacyRequest.id,
      status: "completed",
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
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Invalid request body",
      );
    }

    return apiUnhandledError(error, "Failed to export respondent data", "/api/privacy/respondent-export");
  }
}
