import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  surveys,
  surveyConversations,
  notionIntegrations,
  notionExports,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getNotionClient,
  exportConversationToNotion,
  getNotionPageUrl,
} from "@/lib/notion";
import { decrypt } from "@/lib/encryption";

/**
 * Export a survey conversation to Notion
 */
export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();
    const { conversationId, parentPageId } = body as {
      conversationId: string;
      parentPageId?: string;
    };

    if (!conversationId) {
      return new Response("Conversation ID is required", { status: 400 });
    }

    // Get the user's Notion integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (!integration) {
      return new Response("Notion integration not configured", { status: 400 });
    }

    // Get the conversation
    const [conversation] = await db
      .select()
      .from(surveyConversations)
      .where(eq(surveyConversations.id, conversationId));

    if (!conversation) {
      return new Response("Conversation not found", { status: 404 });
    }

    // Get the survey to verify ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, conversation.surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Use provided parent page ID or the one from integration
    const targetParentPageId = parentPageId || integration.parentPageId;

    if (!targetParentPageId) {
      return new Response(
        "No parent page ID found. Please provide a parent page ID or configure your Notion integration.",
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
      const notionPage = await exportConversationToNotion(
        notion,
        targetParentPageId,
        survey.title,
        {
          id: conversation.id,
          messages: conversation.rawConversation,
          summary: conversation.summary,
          completed: conversation.completed,
          createdAt: conversation.createdAt,
        }
      );

      // Save the export record
      const notionUrl = getNotionPageUrl(notionPage);
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        surveyId: survey.id,
        exportType: "conversation",
        notionPageId: notionPage.id,
        notionUrl,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Conversation exported to Notion successfully",
          notionUrl,
          notionPageId: notionPage.id,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Failed to export conversation to Notion:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to export conversation to Notion",
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
    console.error("Error exporting conversation to Notion:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
