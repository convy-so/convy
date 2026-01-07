"use server";

/**
 * Zapier Integration Actions
 *
 * Server actions for managing Zapier integrations and webhook subscriptions
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import {
  zapierIntegrations,
  zapierWebhookSubscriptions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getWorkspaceOwnerId,
  isWorkspaceOwner,
} from "@/lib/workspace-access";

/**
 * Get Zapier integration status
 */
export async function getZapierIntegrationStatus() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, targetUserId));

    if (!integration) {
      return {
        success: true,
        data: { connected: false },
      };
    }

    // Get active subscriptions count
    const subscriptions = await db
      .select()
      .from(zapierWebhookSubscriptions)
      .where(eq(zapierWebhookSubscriptions.zapierIntegrationId, integration.id));

    const activeSubscriptions = subscriptions.filter((s) => s.active);

    return {
      success: true,
      data: {
        connected: true,
        integrationId: integration.id,
        enabled: integration.enabled,
        embedId: integration.embedId,
        lastUsedAt: integration.lastUsedAt,
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: activeSubscriptions.length,
      },
    };
  } catch (error) {
    console.error("Error getting Zapier status:", error);
    return {
      success: false,
      error: "Failed to get Zapier status",
    };
  }
}

/**
 * Get all webhook subscriptions for the user
 */
export async function getZapierSubscriptions() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, targetUserId));

    if (!integration) {
      return {
        success: true,
        data: [],
      };
    }

    const subscriptions = await db
      .select({
        id: zapierWebhookSubscriptions.id,
        eventType: zapierWebhookSubscriptions.eventType,
        targetUrl: zapierWebhookSubscriptions.targetUrl,
        surveyId: zapierWebhookSubscriptions.surveyId,
        active: zapierWebhookSubscriptions.active,
        triggerCount: zapierWebhookSubscriptions.triggerCount,
        errorCount: zapierWebhookSubscriptions.errorCount,
        lastTriggeredAt: zapierWebhookSubscriptions.lastTriggeredAt,
        createdAt: zapierWebhookSubscriptions.createdAt,
      })
      .from(zapierWebhookSubscriptions)
      .where(
        eq(
          zapierWebhookSubscriptions.zapierIntegrationId,
          integration.id
        )
      )
      .orderBy(zapierWebhookSubscriptions.createdAt);

    return {
      success: true,
      data: subscriptions,
    };
  } catch (error) {
    console.error("Error getting Zapier subscriptions:", error);
    return {
      success: false,
      error: "Failed to get subscriptions",
      data: [],
    };
  }
}

/**
 * Update Zapier integration settings
 */
export async function updateZapierIntegrationSettings(settings: {
  enabled?: boolean;
  embedId?: string;
}) {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
    }

    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, session.user.id));

    if (!integration) {
      // Create integration if it doesn't exist
      const newIntegration = await db.insert(zapierIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        enabled: settings.enabled ?? true,
        embedId: settings.embedId || null,
      }).returning();

      return {
        success: true,
        message: "Zapier integration created",
        data: newIntegration[0],
      };
    }

    await db
      .update(zapierIntegrations)
      .set({
        enabled: settings.enabled ?? integration.enabled,
        embedId: settings.embedId ?? integration.embedId,
        updatedAt: new Date(),
      })
      .where(eq(zapierIntegrations.userId, session.user.id));

    return {
      success: true,
      message: "Settings updated",
    };
  } catch (error) {
    console.error("Error updating Zapier settings:", error);
    return {
      success: false,
      error: "Failed to update settings",
    };
  }
}

/**
 * Disconnect Zapier integration
 */
export async function disconnectZapierIntegration() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
    }

    await db
      .delete(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, session.user.id));

    return {
      success: true,
      message: "Zapier integration disconnected",
    };
  } catch (error) {
    console.error("Error disconnecting Zapier:", error);
    return {
      success: false,
      error: "Failed to disconnect Zapier",
    };
  }
}

