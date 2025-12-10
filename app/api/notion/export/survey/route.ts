import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveys, notionIntegrations, notionExports } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getNotionClient,
  exportSurveyToNotion,
  getNotionPageUrl,
} from "@/lib/notion";
import { decrypt } from "@/lib/encryption";

/**
 * Export a survey to Notion
 */
export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();
    const { surveyId, databaseId } = body as {
      surveyId: string;
      databaseId?: string;
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

    // Use provided database ID or the one from integration
    const targetDatabaseId = databaseId || integration.surveyDatabaseId;

    if (!targetDatabaseId) {
      return new Response(
        "No database ID found. Please configure your Notion integration with a parent page.",
        { status: 400 }
      );
    }

    // Export to Notion - decrypt the access token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );
    const notion = getNotionClient(accessToken);

    try {
      const notionPage = await exportSurveyToNotion(
        notion,
        targetDatabaseId,
        survey
      );

      // Save the export record
      const notionUrl = getNotionPageUrl(notionPage);
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        surveyId: survey.id,
        exportType: "survey",
        notionPageId: notionPage.id,
        notionUrl,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Survey exported to Notion successfully",
          notionUrl,
          notionPageId: notionPage.id,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Failed to export to Notion:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to export to Notion",
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
    console.error("Error exporting survey to Notion:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
