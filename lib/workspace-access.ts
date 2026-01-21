"use server";

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { members, organizations, surveys, projects } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * Check if a user is a member of a workspace
 */
export async function isWorkspaceMember(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(members)
    .where(
      and(eq(members.userId, userId), eq(members.organizationId, organizationId))
    );
  return !!member;
}

/**
 * Check if a user is the owner of a workspace
 */
export async function isWorkspaceOwner(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId),
        eq(members.role, "owner")
      )
    );
  return !!member;
}

/**
 * Get the owner's user ID for a workspace
 * Useful for billing lookups since subscriptions are tied to the owner
 */
export async function getWorkspaceOwnerId(
  organizationId: string
): Promise<string | null> {
  const [owner] = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.role, "owner")));
  
  return owner?.userId ?? null;
}

/**
 * Determine a user's access level for a survey
 * - "owner": The creator of the survey (full access)
 * - "workspace-member": Member of the workspace the survey belongs to (read-only)
 * - "none": No access
 */
export async function getSurveyAccessLevel(
  userId: string,
  surveyId: string
): Promise<"owner" | "editor" | "viewer" | "none"> {
  const [survey] = await db
    .select({
      userId: surveys.userId,
      organizationId: surveys.organizationId,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) return "none";

  // Case 1: Survey belongs to a workspace
  // Case 1: Survey belongs to a workspace
  if (survey.organizationId) {
    // Check if user is a member of this workspace
    const isMember = await isWorkspaceMember(userId, survey.organizationId);
    if (!isMember) return "none";

    // If survey is in a workspace and user is a member:
    // 1. Creator = Owner
    // 2. Workspace Owner = Owner (Can manage/close)
    // 3. Workspace Member = Viewer (Can view, create new)
    
    if (survey.userId === userId) {
      return "owner";
    }

    const isOwner = await isWorkspaceOwner(userId, survey.organizationId);
    if (isOwner) {
      return "owner";
    }

    // Default for all other workspace members
    return "viewer";
  }

  // Case 2: Personal Survey (no organization)
  if (survey.userId === userId) return "owner";

  return "none";
}

/**
 * Get the active workspace ID from the current session
 * Returns null if the user is in their personal account
 */
export async function getActiveWorkspaceId(): Promise<string | null> {
  try {
    const session = await getVerifiedSession();
    return session.session.activeOrganizationId ?? null;
  } catch {
    return null;
  }
}
