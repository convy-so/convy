import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

import {
  createDeletionJob,
  createPrivacyRequest,
  deleteRespondentPrivacyData,
  markDeletionJobStatus,
  markPrivacyRequestResolved,
} from "@/features/privacy/public-server";
import {
  getRespondentSessionCookieName,
  getRespondentSessionCookieOptions,
  resolveRespondentAccess,
} from "@/features/privacy/public-server";
import { getClientIP } from "@/shared/security/client-ip";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  respondentToken: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  let privacyRequestId: string | null = null;
  let deletionJobId: string | null = null;

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
      requestType: "respondent_delete",
      requestPayload: {
        conversationId: body.conversationId,
      },
    });
    privacyRequestId = privacyRequest.id;
    const deletionJob = await createDeletionJob({
      privacyRequestId: privacyRequest.id,
      jobType: "delete_respondent_conversation",
      targetType: "survey_conversation",
      targetId: body.conversationId,
    });
    deletionJobId = deletionJob.id;

    await markDeletionJobStatus({
      deletionJobId,
      status: "in_progress",
    });

    await deleteRespondentPrivacyData(body.conversationId);

    await markDeletionJobStatus({
      deletionJobId,
      status: "completed",
    });
    await markPrivacyRequestResolved({
      requestId: privacyRequest.id,
      status: "completed",
      resultPayload: {
        deletionJobId: deletionJob.id,
      },
    });

    const response = NextResponse.json({
      success: true,
      requestId: privacyRequest.id,
      deletionJobId: deletionJob.id,
    });
    response.cookies.set(
      getRespondentSessionCookieName(body.surveyId),
      "",
      {
        ...getRespondentSessionCookieOptions(),
        maxAge: 0,
      },
    );
    return response;
  } catch (error) {
    if (deletionJobId) {
      await markDeletionJobStatus({
        deletionJobId,
        status: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => undefined);
    }
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

    return apiUnhandledError(error, "Failed to delete respondent data", "/api/privacy/respondent-delete");
  }
}
