/**
 * Notion OAuth utilities
 *
 * Handles OAuth-specific operations like structure initialization,
 * token management, and client creation
 */

import { Client } from "@notionhq/client";
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { createSurveyDatabase } from "@/lib/notion";

/**
 * Get Notion client with decrypted OAuth token
 */
export async function getNotionOAuthClient(
  userId: string
): Promise<Client | null> {
  try {
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, userId));

    if (!integration) {
      return null;
    }

    // Decrypt the access token
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );

    return new Client({
      auth: accessToken,
    });
  } catch (error) {
    console.error("Failed to get Notion OAuth client:", error);
    return null;
  }
}

/**
 * Get integration details for a user
 */
export async function getNotionIntegration(userId: string) {
  const [integration] = await db
    .select()
    .from(notionIntegrations)
    .where(eq(notionIntegrations.userId, userId));

  return integration;
}

/**
 * Initialize Notion structure for new integration
 * Creates parent page and survey database
 */
export async function initializeNotionStructure(
  userId: string,
  accessToken: string
) {
  const notion = new Client({ auth: accessToken });

  try {
    // Search for existing "Convy Surveys" page
    const search = await notion.search({
      query: "Convy Surveys",
      filter: {
        property: "object",
        value: "page",
      },
      page_size: 10,
    });

    let parentPageId: string;
    let surveyDatabaseId: string | null = null;

    // Check if we found the parent page
    const existingPage = search.results.find((result) => {
      if (result.object === "page" && "properties" in result) {
        const title =
          result.properties.title?.type === "title"
            ? result.properties.title.title
            : [];
        return title.some((t) => t.plain_text === "Convy Surveys");
      }
      return false;
    });

    if (existingPage && existingPage.object === "page") {
      // Use existing page
      parentPageId = existingPage.id;
      console.log("Found existing Convy Surveys page:", parentPageId);

      // Search for existing survey database
      // Note: filter doesn't support "database", so we search without filter and filter manually
      const dbSearch = await notion.search({
        query: "Surveys",
        page_size: 10,
      });

      // Type assertion: search results can include databases even though filter doesn't support it
      const existingDb = dbSearch.results.find((result) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        if (r.object === "database" && "title" in r) {
          return r.title.some(
            (t: { plain_text: string }) => t.plain_text === "Surveys"
          );
        }
        return false;
      }) as
        | {
            object: "database";
            id: string;
            title: Array<{ plain_text: string }>;
          }
        | undefined;

      if (existingDb && existingDb.object === "database") {
        surveyDatabaseId = existingDb.id;
        console.log("Found existing Surveys database:", surveyDatabaseId);
      }
    } else {
      console.log("Creating new Convy Surveys parent page");

      const parentPage = await notion.pages.create({
        parent: {
          type: "page_id",
          page_id: await getDefaultParentPage(notion),
        },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: "Convy Surveys",
                },
              },
            ],
          },
        },
        children: [
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: "📊 Convy Survey Analytics",
                  },
                },
              ],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content:
                      "This page contains all your survey data, analytics, and insights from Convy. Data is automatically synchronized.",
                  },
                },
              ],
            },
          },
        ],
      });

      parentPageId = parentPage.id;
      console.log("Created parent page:", parentPageId);
    }

    // Create survey database if it doesn't exist
    if (!surveyDatabaseId) {
      console.log("Creating Surveys database");
      const database = await createSurveyDatabase(
        notion,
        parentPageId,
        "Surveys"
      );
      surveyDatabaseId = database.id;
      console.log("Created database:", surveyDatabaseId);
    }

    // Update integration with structure IDs
    await db
      .update(notionIntegrations)
      .set({
        parentPageId,
        surveyDatabaseId,
        updatedAt: new Date(),
      })
      .where(eq(notionIntegrations.userId, userId));

    console.log("Notion structure initialized successfully:", {
      userId,
      parentPageId,
      surveyDatabaseId,
    });

    return {
      parentPageId,
      surveyDatabaseId,
    };
  } catch (error) {
    console.error("Failed to initialize Notion structure:", error);
    throw error;
  }
}

/**
 * Get default parent page (workspace root)
 * Uses the first page the bot has access to
 */
async function getDefaultParentPage(notion: Client): Promise<string> {
  try {
    // Search for any page to use as parent
    const search = await notion.search({
      filter: {
        property: "object",
        value: "page",
      },
      page_size: 1,
    });

    if (search.results.length > 0 && search.results[0].object === "page") {
      return search.results[0].id;
    }

    throw new Error("No accessible pages found in workspace");
  } catch (error) {
    console.error("Failed to get default parent page:", error);
    throw error;
  }
}

/**
 * Check if user has OAuth integration configured
 */
export async function hasOAuthIntegration(userId: string): Promise<boolean> {
  const integration = await getNotionIntegration(userId);
  return !!(integration && integration.accessToken);
}

/**
 * Update integration sync settings
 */
export async function updateSyncSettings(
  userId: string,
  settings: {
    autoSync?: boolean;
    syncOnNewConversation?: boolean;
    syncOnAnalyticsUpdate?: boolean;
  }
) {
  await db
    .update(notionIntegrations)
    .set({
      ...settings,
      updatedAt: new Date(),
    })
    .where(eq(notionIntegrations.userId, userId));
}

/**
 * Disconnect OAuth integration
 */
export async function disconnectOAuthIntegration(userId: string) {
  await db
    .delete(notionIntegrations)
    .where(eq(notionIntegrations.userId, userId));
}
