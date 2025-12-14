import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getNotionClient, createSurveyDatabase } from "@/lib/notion-improved";
import { encrypt } from "@/lib/encryption";

/**
 * Configure Notion integration for the user
 * POST: Connect Notion workspace and create/configure database
 * GET: Get current Notion integration settings
 * DELETE: Disconnect Notion integration
 */

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();
    const { notionToken, parentPageId, workspaceName } = body as {
      notionToken: string;
      parentPageId?: string;
      workspaceName?: string;
    };

    if (!notionToken) {
      return new Response("Notion token is required", { status: 400 });
    }

    // Test the token by trying to retrieve user info
    const notion = getNotionClient(notionToken);

    try {
      // Test the connection
      await notion.users.me({});
    } catch (error) {
      console.error("Failed to verify Notion token:", error);
      return new Response("Invalid Notion token", { status: 400 });
    }

    // Create or update the integration
    const [existingIntegration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    let surveyDatabaseId = existingIntegration?.surveyDatabaseId || null;

    // If a parent page ID is provided, create a survey database
    if (parentPageId && !surveyDatabaseId) {
      try {
        const database = await createSurveyDatabase(
          notion,
          parentPageId,
          "Surveys"
        );
        surveyDatabaseId = database.id;
      } catch (error) {
        console.error("Failed to create survey database:", error);
        // Continue without creating the database - user can create it manually
      }
    }

    // Encrypt the token for secure storage (required by schema)
    const encryptedToken = encrypt(notionToken);

    if (existingIntegration) {
      // Update existing integration
      await db
        .update(notionIntegrations)
        .set({
          accessToken: encryptedToken.encrypted,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          parentPageId: parentPageId || existingIntegration.parentPageId,
          workspaceName: workspaceName || existingIntegration.workspaceName,
          surveyDatabaseId:
            surveyDatabaseId || existingIntegration.surveyDatabaseId,
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      // Create new integration
      await db.insert(notionIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        accessToken: encryptedToken.encrypted,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.tag,
        parentPageId: parentPageId || null,
        workspaceName: workspaceName || null,
        surveyDatabaseId: surveyDatabaseId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notion integration configured successfully",
        surveyDatabaseId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error configuring Notion integration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getVerifiedSession();

    const [integration] = await db
      .select({
        id: notionIntegrations.id,
        workspaceName: notionIntegrations.workspaceName,
        parentPageId: notionIntegrations.parentPageId,
        surveyDatabaseId: notionIntegrations.surveyDatabaseId,
        createdAt: notionIntegrations.createdAt,
      })
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (!integration) {
      return new Response(
        JSON.stringify({
          connected: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        connected: true,
        integration,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error fetching Notion integration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getVerifiedSession();

    await db
      .delete(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notion integration disconnected successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error disconnecting Notion integration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
