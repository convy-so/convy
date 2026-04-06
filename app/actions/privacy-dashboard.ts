"use server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { privacyRequests, consentEvents } from "@/db/schema/privacy";
import { users } from "@/db/schema/auth";
import { eq, desc } from "drizzle-orm";
import { isWorkspaceOwner } from "@/lib/workspace-access";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getPrivacyDashboardData(): Promise<ActionResult<{
  requests: any[];
  consents: any[];
}>> {
  try {
    const session = await getVerifiedSession();
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      return { success: false, error: "No active workspace selected" };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return { success: false, error: "Unauthorized: Owner access required" };
    }

    const db = getDb();
    
    // Fetch recent privacy requests with user info
    const requests = await db
      .select({
        id: privacyRequests.id,
        requestType: privacyRequests.requestType,
        status: privacyRequests.status,
        createdAt: privacyRequests.createdAt,
        user: {
          name: users.name,
          email: users.email,
        }
      })
      .from(privacyRequests)
      .leftJoin(users, eq(privacyRequests.userId, users.id))
      .where(eq(privacyRequests.organizationId, organizationId))
      .orderBy(desc(privacyRequests.createdAt))
      .limit(50);

    // Fetch recent consent events
    const consents = await db
      .select({
        id: consentEvents.id,
        subjectType: consentEvents.subjectType,
        consentKey: consentEvents.consentKey,
        decision: consentEvents.decision,
        createdAt: consentEvents.createdAt,
        evidence: consentEvents.evidence,
      })
      .from(consentEvents)
      .where(eq(consentEvents.organizationId, organizationId))
      .orderBy(desc(consentEvents.createdAt))
      .limit(50);

    return {
      success: true,
      data: {
        requests,
        consents,
      }
    };
  } catch (error) {
    console.error("Error fetching privacy dashboard data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch privacy data",
    };
  }
}
