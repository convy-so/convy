import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  surveys,
  surveyAnalytics,
  notionIntegrations,
  notionExports,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getNotionClient, exportAnalyticsToNotion } from "@/lib/notion";

/**
 * Export survey analytics to Notion
 */
export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();
    const { surveyId, parentPageId } = body as {
      surveyId: string;
      parentPageId?: string;
    };

    if (!surveyId) {
      return new Response("Survey ID is required", { status: 400 });
    }

    // Get the user's Notion integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (!integration) {
      return new Response("Notion integration not configured", { status: 400 });
    }

    // Get the survey
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Get the analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      return new Response("Analytics not found for this survey", {
        status: 404,
      });
    }

    // Use provided parent page ID or the one from integration
    const targetParentPageId = parentPageId || integration.parentPageId;

    if (!targetParentPageId) {
      return new Response(
        "No parent page ID found. Please provide a parent page ID or configure your Notion integration.",
        { status: 400 }
      );
    }

    // Export to Notion
    const notion = getNotionClient(integration.notionToken);

    try {
      const notionPage = await exportAnalyticsToNotion(
        notion,
        targetParentPageId,
        survey.title,
        {
          overallSummary: analytics.overallSummary,
          totalConversations: analytics.totalConversations,
          averageConversationLength: analytics.averageConversationLength,
          metrics: analytics.metrics,
        }
      );

      // Save the export record
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        surveyId: survey.id,
        exportType: "analytics",
        notionPageId: notionPage.id,
        notionUrl: notionPage.url,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Analytics exported to Notion successfully",
          notionUrl: notionPage.url,
          notionPageId: notionPage.id,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Failed to export analytics to Notion:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to export analytics to Notion",
          details:
            error instanceof Error ? error.message : "Unknown error occurred",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error exporting analytics to Notion:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
