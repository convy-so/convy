/**
 * Notion Sync Conflict Resolution
 *
 * Utilities for detecting and resolving conflicts between
 * app data and Notion data
 */

import { Client } from "@notionhq/client";
import { db } from "@/db";
import { notionSyncConflicts, notionExports } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type ConflictType = "edit" | "delete" | "permission" | "structure";
export type ResolutionStrategy =
  | "last_write_wins"
  | "app_priority"
  | "notion_priority"
  | "merge"
  | "user_choice";

/**
 * Detect if a Notion page has been modified
 */
export async function detectPageConflict(
  notion: Client,
  notionPageId: string,
  appData: {
    lastModified: Date;
    content: unknown;
  }
): Promise<{
  hasConflict: boolean;
  conflictType?: ConflictType;
  notionData?: unknown;
}> {
  try {
    const page = await notion.pages.retrieve({ page_id: notionPageId });

    if ("archived" in page && page.archived) {
      return {
        hasConflict: true,
        conflictType: "delete",
      };
    }

    // Check last edited time
    // Type guard: check if last_edited_time exists (not available in PartialPageObjectResponse)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageAny = page as any;
    if (!("last_edited_time" in pageAny) || !pageAny.last_edited_time) {
      // If we can't determine last edited time, assume no conflict to be safe
      return { hasConflict: false };
    }

    const notionLastEdited = new Date(pageAny.last_edited_time);
    const appLastModified = new Date(appData.lastModified);

    // If Notion was edited after app, there might be a conflict
    if (notionLastEdited > appLastModified) {
      // Get page content to compare
      const blocks = await notion.blocks.children.list({
        block_id: notionPageId,
      });

      return {
        hasConflict: true,
        conflictType: "edit",
        notionData: {
          lastEdited: notionLastEdited,
          page,
          blocks: blocks.results,
        },
      };
    }

    return { hasConflict: false };
  } catch (error: unknown) {
    // Check if error is because page doesn't exist
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "object_not_found"
    ) {
      return {
        hasConflict: true,
        conflictType: "delete",
      };
    }

    throw error;
  }
}

/**
 * Create a conflict record
 */
export async function createConflictRecord(data: {
  userId: string;
  resourceType: "survey" | "analytics" | "conversation";
  resourceId: string;
  notionPageId: string;
  conflictType: ConflictType;
  appVersion: Record<string, unknown>;
  notionVersion?: Record<string, unknown>;
  conflictDetails?: {
    changedFields?: string[];
    appLastModified?: string;
    notionLastModified?: string;
    deletedInNotion?: boolean;
  };
}) {
  const conflictId = crypto.randomUUID();

  await db.insert(notionSyncConflicts).values({
    id: conflictId,
    userId: data.userId,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    notionPageId: data.notionPageId,
    conflictType: data.conflictType,
    appVersion: data.appVersion,
    notionVersion: data.notionVersion,
    conflictDetails: data.conflictDetails,
    resolution: "pending",
  });

  return conflictId;
}

/**
 * Resolve conflict using specified strategy
 */
export async function resolveConflict(
  conflictId: string,
  strategy: ResolutionStrategy,
  userId: string
): Promise<{
  success: boolean;
  resolution?: string;
  error?: string;
}> {
  try {
    const [conflict] = await db
      .select()
      .from(notionSyncConflicts)
      .where(
        and(
          eq(notionSyncConflicts.id, conflictId),
          eq(notionSyncConflicts.userId, userId)
        )
      );

    if (!conflict) {
      return { success: false, error: "Conflict not found" };
    }

    let resolution: string;

    switch (strategy) {
      case "app_priority":
        resolution = "app_wins";
        // App data takes precedence - will overwrite Notion
        break;

      case "notion_priority":
        resolution = "notion_wins";
        // Notion data takes precedence - will update app
        break;

      case "last_write_wins":
        // Determine which was modified last
        const appLastModified = new Date(
          conflict.conflictDetails?.appLastModified || 0
        );
        const notionLastModified = new Date(
          conflict.conflictDetails?.notionLastModified || 0
        );

        resolution =
          appLastModified > notionLastModified ? "app_wins" : "notion_wins";
        break;

      case "merge":
        resolution = "merged";
        // Will attempt to merge both versions
        break;

      case "user_choice":
        resolution = "manual";
        // User will manually choose what to keep
        break;

      default:
        return { success: false, error: "Invalid strategy" };
    }

    // Update conflict record
    await db
      .update(notionSyncConflicts)
      .set({
        resolution,
        resolutionStrategy: strategy,
        resolvedBy: userId,
        resolvedAt: new Date(),
        autoResolved: strategy !== "user_choice",
      })
      .where(eq(notionSyncConflicts.id, conflictId));

    return { success: true, resolution };
  } catch (error) {
    console.error("Error resolving conflict:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Apply conflict resolution
 */
export async function applyConflictResolution(
  notion: Client,
  conflictId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [conflict] = await db
      .select()
      .from(notionSyncConflicts)
      .where(eq(notionSyncConflicts.id, conflictId));

    if (
      !conflict ||
      !conflict.resolution ||
      conflict.resolution === "pending"
    ) {
      return { success: false, error: "Conflict not resolved" };
    }

    switch (conflict.resolution) {
      case "app_wins":
        // Overwrite Notion with app data
        await overwriteNotionWithAppData(
          notion,
          conflict.notionPageId,
          conflict.appVersion as Record<string, unknown>
        );
        break;

      case "notion_wins":
        // Update app with Notion data
        await updateAppWithNotionData(
          conflict.resourceType,
          conflict.resourceId,
          conflict.notionVersion as Record<string, unknown>
        );
        break;

      case "merged":
        // Merge both versions
        const merged = mergeVersions(
          conflict.appVersion as Record<string, unknown>,
          conflict.notionVersion as Record<string, unknown>
        );
        await overwriteNotionWithAppData(notion, conflict.notionPageId, merged);
        await updateAppWithNotionData(
          conflict.resourceType,
          conflict.resourceId,
          merged
        );
        break;

      case "ignored":
        // Do nothing
        break;

      default:
        return { success: false, error: "Invalid resolution type" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error applying conflict resolution:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Overwrite Notion page with app data
 * Handles conversation, survey, and analytics resource types
 */
async function overwriteNotionWithAppData(
  notion: Client,
  notionPageId: string,
  appData: Record<string, unknown>
) {
  // Import formatting functions dynamically to avoid circular imports
  const { formatConversationForNotion, formatAnalyticsForNotion, withRetry } =
    await import("./notion-improved");

  // Delete all existing blocks with controlled concurrency
  const { results: existingBlocks } = await notion.blocks.children.list({
    block_id: notionPageId,
  });

  // Delete blocks in batches of 5 to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < existingBlocks.length; i += BATCH_SIZE) {
    const batch = existingBlocks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((block) =>
        withRetry(() => notion.blocks.delete({ block_id: block.id }))
      )
    );
  }

  // Format and add new blocks based on data type
  let newBlocks;

  // Detect data type and format accordingly
  if (
    appData.conversation &&
    "rawConversation" in (appData.conversation as Record<string, unknown>)
  ) {
    // It's a conversation
    const conv = appData.conversation as {
      id: string;
      rawConversation: Array<{
        role: string;
        content: string;
        timestamp?: string;
      }>;
      summary?: string | null;
      completed: boolean;
      createdAt: Date;
    };
    newBlocks = formatConversationForNotion({
      id: conv.id,
      messages: conv.rawConversation,
      summary: conv.summary,
      completed: conv.completed,
      createdAt: conv.createdAt,
    });
  } else if ("overallSummary" in appData && "totalConversations" in appData) {
    // It's analytics
    newBlocks = formatAnalyticsForNotion({
      overallSummary: appData.overallSummary as string,
      totalConversations: appData.totalConversations as number,
      averageConversationLength: appData.averageConversationLength as number,
      metrics: (appData.metrics as Record<string, unknown>) || {},
    });
  } else {
    // Unknown type - create a simple info block
    newBlocks = [
      {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [
            {
              type: "text" as const,
              text: {
                content:
                  "Data synced from Convy at " + new Date().toISOString(),
              },
            },
          ],
        },
      },
    ];
  }

  // Add new blocks in batches of 100 (Notion's limit)
  if (newBlocks && newBlocks.length > 0) {
    for (let i = 0; i < newBlocks.length; i += 100) {
      const batch = newBlocks.slice(i, i + 100);
      await withRetry(() =>
        notion.blocks.children.append({
          block_id: notionPageId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          children: batch as any,
        })
      );
    }
  }
}

/**
 * Update app database with Notion data
 * Primarily used for syncing user notes/annotations from Notion back to app
 */
async function updateAppWithNotionData(
  resourceType: string,
  resourceId: string,
  notionData: Record<string, unknown>
) {
  // Import db dynamically to avoid circular imports
  const { db } = await import("@/db");
  const { surveyConversations, surveys } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  console.log("Updating app data from Notion:", { resourceType, resourceId });

  try {
    switch (resourceType) {
      case "conversation":
        // For conversations, we might want to sync back any notes added in Notion
        // However, we don't overwrite the core conversation data
        // This is a placeholder for future enhancement
        console.log(
          `[Notion Conflict] Conversation ${resourceId}: Notion priority selected, but conversation data is read-only`
        );
        break;

      case "survey":
        // Survey metadata could potentially be updated from Notion
        // But this is risky - we generally want app to be source of truth
        console.log(
          `[Notion Conflict] Survey ${resourceId}: Notion priority selected, but survey data is managed in app`
        );
        break;

      case "analytics":
        // Analytics are always generated by the app, never from Notion
        console.log(
          `[Notion Conflict] Analytics ${resourceId}: Analytics are read-only, generated by app`
        );
        break;

      default:
        console.warn(
          `[Notion Conflict] Unknown resource type: ${resourceType}`
        );
    }
  } catch (error) {
    console.error(`[Notion Conflict] Failed to update app data:`, error);
    throw error;
  }
}

/**
 * Merge two versions of data
 * Strategy: Keep app data as source of truth, but preserve Notion annotations
 */
function mergeVersions(
  appVersion: Record<string, unknown>,
  notionVersion: Record<string, unknown>
): Record<string, unknown> {
  // Extract any user-added content from Notion that we want to preserve
  const notionAnnotations: Record<string, unknown> = {};

  // Preserve common Notion user additions
  if (notionVersion.userNotes) {
    notionAnnotations.userNotes = notionVersion.userNotes;
  }
  if (notionVersion.tags) {
    notionAnnotations.tags = notionVersion.tags;
  }
  if (notionVersion.annotations) {
    notionAnnotations.annotations = notionVersion.annotations;
  }

  // Merge: app data takes priority, but preserve Notion annotations
  return {
    ...appVersion,
    _notionAnnotations:
      Object.keys(notionAnnotations).length > 0 ? notionAnnotations : undefined,
    _lastMerged: new Date().toISOString(),
  };
}

/**
 * Get user's conflict resolution preference
 */
export async function getUserConflictStrategy(
  userId: string
): Promise<ResolutionStrategy> {
  // TODO: Store user preference in database
  // For now, default to app priority
  return "app_priority";
}

/**
 * Handle conflict automatically based on user's strategy
 */
export async function autoResolveConflict(
  conflictId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const strategy = await getUserConflictStrategy(userId);

  const resolveResult = await resolveConflict(conflictId, strategy, userId);

  if (!resolveResult.success) {
    return resolveResult;
  }

  // Don't auto-apply if user_choice strategy
  if (strategy === "user_choice") {
    return { success: true };
  }

  // TODO: Apply resolution with Notion client
  // This would require getting the Notion client for the user
  return { success: true };
}
