import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { createSignedSurveyMediaUrl } from "@/lib/storage";
import { resolveRespondentAccess } from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string; mediaId: string }> },
) {
  const { surveyId, mediaId } = await params;
  const { searchParams } = new URL(request.url);
  const respondentToken = searchParams.get("respondentToken");

  const survey = await getDb().query.surveys.findFirst({
    where: eq(surveys.id, surveyId),
  });

  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const media = Array.isArray(survey.media)
    ? survey.media.find((item) => isRecord(item) && item.id === mediaId)
    : null;

  if (!media || !isRecord(media)) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const session = await getCurrentSession();
  const permission = session
    ? await getSurveyPermissionForSession(session, surveyId)
    : null;

  if (!hasSurveyPermission(permission, "canView")) {
    const tokenRecord = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId,
      explicitToken: respondentToken,
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
  }

  if (typeof media.storagePath !== "string" || typeof media.type !== "string") {
    return NextResponse.json({ error: "Media is unavailable" }, { status: 404 });
  }

  const signedUrl = await createSignedSurveyMediaUrl(
    media.storagePath,
    media.type === "audio" || media.type === "video" ? media.type : "image",
  );

  return NextResponse.redirect(signedUrl);
}
