import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { env } from "@/lib/env";
import {
  issueRespondentResumeToken,
  resolveRespondentAccess,
} from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";
import { fetchSurveyByShareableLink } from "@/lib/surveys/public-survey-access";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  locale: z.string().min(2).max(10).optional(),
});

function buildResumeLink(input: {
  shareableLink: string;
  resumeToken: string;
  locale?: string;
}) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  const localePrefix = input.locale ? `/${encodeURIComponent(input.locale)}` : "";

  return `${baseUrl}${localePrefix}/s/${encodeURIComponent(input.shareableLink)}/respond?resume=${encodeURIComponent(input.resumeToken)}`;
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const body = bodySchema.parse(await request.json());

    const survey = await fetchSurveyByShareableLink(shareableLink);

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const respondentAccess = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId: survey.id,
      conversationId: body.conversationId,
      sessionAllowedScopes: ["respondent_session"],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!respondentAccess) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const resumeToken = await issueRespondentResumeToken({
      surveyId: survey.id,
      conversationId: respondentAccess.conversationId,
      participantId: respondentAccess.participantId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonNoStore({
      success: true,
      resumeLink: buildResumeLink({
        shareableLink,
        resumeToken,
        locale: body.locale,
      }),
    });
  } catch (error) { if (error instanceof z.ZodError) { return apiError("VALIDATION_ERROR", error.errors[0]?.message ?? "Invalid request body"); } return apiUnhandledError(error, "Failed to create resume link", "/api/surveys/respond/[shareableLink]/resume-link:post"); }
}

