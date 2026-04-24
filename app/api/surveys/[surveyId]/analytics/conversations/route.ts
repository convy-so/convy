import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { translateConversationListItems } from "@/lib/analytics";
import { getConversationInsights } from "@/lib/analytics/conversation-queries";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { getUserPreferredLanguage } from "@/lib/translation-service";
import { normalizeAppLocale } from "@/lib/i18n/config";

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
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Analytics Conversations API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation insights" },
      { status: 500 },
    );
  }
}
