"use server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import type { ConsentEvidence } from "@/db/schema/privacy";
import { privacyRequests, consentEvents } from "@/db/schema/privacy";
import { users } from "@/db/schema/auth";
import { eq, desc } from "drizzle-orm";
import { isWorkspaceOwner } from "@/lib/workspace-access";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type PrivacyDashboardRequestRow = {
  id: string;
  requestType: string;
  status: string;
  createdAt: Date;
  user: {
    name: string | null;
    email: string | null;
  };
};

export type PrivacyDashboardConsentRow = {
  id: string;
  subjectType: string;
  consentKey: string;
  decision: string;
  createdAt: Date;
  evidence: ConsentEvidence;
};

export async function getPrivacyDashboardData(): Promise<ActionResult<{
  requests: PrivacyDashboardRequestRow[];
  consents: PrivacyDashboardConsentRow[];
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
        requests: requests.map(r => ({
          ...r,
          user: {
            name: r.user?.name ?? null,
            email: r.user?.email ?? null,
          }
        })),
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
