import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { env } from "@/lib/env";
import {
  issueRespondentResumeToken,
  resolveRespondentAccess,
} from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";

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

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .then((rows) => rows[0]);

    if (!survey) {
      return jsonNoStore({ error: "Survey not found" }, { status: 404 });
    }

    const respondentAccess = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId: survey.id,
      conversationId: body.conversationId,
      sessionAllowedScopes: ["respondent_session"],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!respondentAccess) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }

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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonNoStore(
        { error: error.errors[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    return jsonNoStore(
      { error: "Failed to create resume link" },
      { status: 500 },
    );
  }
}
