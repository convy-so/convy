"use server";

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { members, organizations, surveys, projects, surveyTeamMembers } from "@/db/schema";
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
  if (survey.organizationId) {
    // CRITICAL: First check if user is still a member of this workspace
    // Even if they are the creator (userId matches), they lose access if removed from workspace
    const isMember = await isWorkspaceMember(userId, survey.organizationId);
    if (!isMember) return "none";

    // If they are a member, check for granular survey role
    const [teamMember] = await db
      .select({ role: surveyTeamMembers.role })
      .from(surveyTeamMembers)
      .where(
        and(
          eq(surveyTeamMembers.surveyId, surveyId),
          eq(surveyTeamMembers.userId, userId)
        )
      );

    if (teamMember) {
      // Explicit role assignment takes precedence
      // Map 'owner' | 'editor' | 'viewer' directly
      return teamMember.role as "owner" | "editor" | "viewer";
    }

    // Fallback: If they created it AND are still in the workspace, they are owner
    if (survey.userId === userId) return "owner";

    // Fallback 2: Check workspace role (Admins might get access?)
    // For now, let's keep it strict. If not in survey team and not creator, 
    // maybe check if they are Workspace Owner?
    const isOwner = await isWorkspaceOwner(userId, survey.organizationId);
    if (isOwner) return "owner"; // Workspace owner overrides

    // Default for other members: currently 'none' or 'viewer'?
    // The user requested enforcing granular roles, so 'none' is safer unless added.
    return "none"; 
  }

  // Case 2: Personal Survey (no organization)
  if (survey.userId === userId) return "owner";

  // Check unique shared access (if we support sharing personal surveys via team table)
  const [teamMember] = await db
    .select({ role: surveyTeamMembers.role })
    .from(surveyTeamMembers)
    .where(
      and(
        eq(surveyTeamMembers.surveyId, surveyId),
        eq(surveyTeamMembers.userId, userId)
      )
    );

   if (teamMember) {
      return teamMember.role as "owner" | "editor" | "viewer";
   }

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
