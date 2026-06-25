import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { getCurrentSession } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { createSignedSurveyMediaUrl } from "@/shared/infra/supabase-storage";
import { resolveRespondentAccess } from "@/features/privacy/public-server";
import { getClientIP } from "@/shared/security/client-ip";

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
    return apiError("NOT_FOUND", "Survey not found");
  }

  const media = Array.isArray(survey.media)
    ? survey.media.find((item) => isRecord(item) && item.id === mediaId)
    : null;

  if (!media || !isRecord(media)) {
    return apiError("NOT_FOUND", "Media not found");
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
      return apiError("UNAUTHORIZED", "Unauthorized");
    }
  }

  if (typeof media.storagePath !== "string" || typeof media.type !== "string") {
    return apiError("NOT_FOUND", "Media is unavailable");
  }

  const signedUrl = await createSignedSurveyMediaUrl(
    media.storagePath,
    media.type === "audio" || media.type === "video" ? media.type : "image",
  );

  return NextResponse.redirect(signedUrl);
}
