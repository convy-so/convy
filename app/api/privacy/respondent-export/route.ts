import { NextResponse } from "next/server";
import { z } from "zod";

import { createPrivacyRequest, exportRespondentPrivacyData, markPrivacyRequestResolved } from "@/lib/privacy/service";
import { resolveRespondentAccess } from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Failed to export respondent data" }, { status: 400 });
  }
}
