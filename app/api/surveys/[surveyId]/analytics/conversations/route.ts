import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { translateConversationListItems } from "@/features/surveys/server/analytics/dashboard-analytics";
import { getConversationInsights } from "@/features/surveys/server/analytics/conversation-queries";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { getUserPreferredLanguage } from "@/features/surveys/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
    );
    const viewerLanguage = normalizeAppLocale(
      searchParams.get("language") ??
        (await getUserPreferredLanguage(session.user.id).catch(() => "en")),
    );

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const result = await getConversationInsights(surveyId, page, limit);

    const translated = await translateConversationListItems(
      result.conversations,
      viewerLanguage,
      { userId: session.user.id, surveyId },
    );

    return NextResponse.json({
      ...result,
      conversations: translated,
    });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Failed to fetch conversation insights", "/api/surveys/[surveyId]/analytics/conversations:get");
  }
}

