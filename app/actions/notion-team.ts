"use server";

/**
 * Notion Team Collaboration Actions
 *
 * Server actions for managing team members, permissions,
 * and syncing access to Notion
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import {
  surveys,
  surveyTeamMembers,
  users,
  notionPagePermissions,
  notionExports,
} from "@/db/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";
import { getNotionOAuthClient } from "@/lib/notion-oauth";

/**
 * Check if user has access to a survey
 */
export async function checkSurveyAccess(surveyId: string, userId: string) {
  // Check if user is owner
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (survey && survey.userId === userId) {
    return { hasAccess: true, role: "owner" as const };
  }

  // Check if user is a team member
  const [member] = await db
    .select()
    .from(surveyTeamMembers)
    .where(
      and(
        eq(surveyTeamMembers.surveyId, surveyId),
        eq(surveyTeamMembers.userId, userId),
        isNotNull(surveyTeamMembers.acceptedAt) // Check if invitation has been accepted
      )
    );

  if (member) {
    return { hasAccess: true, role: member.role };
  }

  return { hasAccess: false, role: null };
}

/**
 * Invite a team member to a survey
 */
export async function inviteTeamMember(data: {
  surveyId: string;
  email: string;
  role: "editor" | "viewer";
  notionAccess?: boolean;
  canSync?: boolean;
}) {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership or permission to invite
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, data.surveyId));

    if (!survey) {
      return {
        success: false,
        error: "Survey not found",
      };
    }

    const isOwner = survey.userId === session.user.id;

    if (!isOwner) {
      // Check if user has permission to invite
      const [member] = await db
        .select()
        .from(surveyTeamMembers)
        .where(
          and(
            eq(surveyTeamMembers.surveyId, data.surveyId),
            eq(surveyTeamMembers.userId, session.user.id)
          )
        );

      if (!member || !member.canInvite) {
        return {
          success: false,
          error: "You don't have permission to invite team members",
        };
      }
    }

    // Find user by email
    const [invitedUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email));

    if (!invitedUser) {
      return {
        success: false,
        error: "User not found with that email",
      };
    }

    // Check if already a member
    const [existingMember] = await db
      .select()
      .from(surveyTeamMembers)
      .where(
        and(
          eq(surveyTeamMembers.surveyId, data.surveyId),
          eq(surveyTeamMembers.userId, invitedUser.id)
        )
      );

    if (existingMember) {
      return {
        success: false,
        error: "User is already a team member",
      };
    }

    // Create team member invitation
    const invitationToken = crypto.randomUUID();

    await db.insert(surveyTeamMembers).values({
      id: crypto.randomUUID(),
      surveyId: data.surveyId,
      userId: invitedUser.id,
      invitedBy: session.user.id,
      role: data.role,
      notionAccess: data.notionAccess ?? true,
      canSync: data.canSync ?? false,
      canInvite: false, // Default: only owners can invite
      invitationToken,
      acceptedAt: null, // Not accepted yet
    });

    // TODO: Send email invitation

    return {
      success: true,
      message: "Team member invited successfully",
      invitationToken,
    };
  } catch (error) {
    console.error("Error inviting team member:", error);
    return {
      success: false,
      error: "Failed to invite team member",
    };
  }
}

/**
 * Accept team invitation
 */
export async function acceptTeamInvitation(invitationToken: string) {
  try {
    const session = await getVerifiedSession();

    const [invitation] = await db
      .select()
      .from(surveyTeamMembers)
      .where(
        and(
          eq(surveyTeamMembers.invitationToken, invitationToken),
          eq(surveyTeamMembers.userId, session.user.id)
        )
      );

    if (!invitation) {
      return {
        success: false,
        error: "Invitation not found or already accepted",
      };
    }

    if (invitation.acceptedAt) {
      return {
        success: false,
        error: "Invitation already accepted",
      };
    }

    // Accept invitation
    await db
      .update(surveyTeamMembers)
      .set({
        acceptedAt: new Date(),
        invitationToken: null, // Clear token
      })
      .where(eq(surveyTeamMembers.id, invitation.id));

    // Sync permissions to Notion if user has Notion access
    if (invitation.notionAccess) {
      await syncTeamMemberToNotion(
        invitation.surveyId,
        session.user.id,
        invitation.role
      );
    }

    return {
      success: true,
      message: "Invitation accepted successfully",
      surveyId: invitation.surveyId,
    };
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return {
      success: false,
      error: "Failed to accept invitation",
    };
  }
}

/**
 * Get team members for a survey
 */
export async function getSurveyTeamMembers(surveyId: string) {
  try {
    const session = await getVerifiedSession();

    // Verify access
    const access = await checkSurveyAccess(surveyId, session.user.id);
    if (!access.hasAccess) {
      return {
        success: false,
        error: "Unauthorized",
        members: [],
      };
    }

    const members = await db
      .select({
        id: surveyTeamMembers.id,
        userId: surveyTeamMembers.userId,
        userName: users.name,
        userEmail: users.email,
        role: surveyTeamMembers.role,
        notionAccess: surveyTeamMembers.notionAccess,
        canSync: surveyTeamMembers.canSync,
        canInvite: surveyTeamMembers.canInvite,
        acceptedAt: surveyTeamMembers.acceptedAt,
        createdAt: surveyTeamMembers.createdAt,
      })
      .from(surveyTeamMembers)
      .leftJoin(users, eq(surveyTeamMembers.userId, users.id))
      .where(eq(surveyTeamMembers.surveyId, surveyId))
      .orderBy(surveyTeamMembers.createdAt);

    return {
      success: true,
      members,
    };
  } catch (error) {
    console.error("Error getting team members:", error);
    return {
      success: false,
      error: "Failed to get team members",
      members: [],
    };
  }
}

/**
 * Update team member role/permissions
 */
export async function updateTeamMember(
  memberId: string,
  updates: {
    role?: "editor" | "viewer";
    notionAccess?: boolean;
    canSync?: boolean;
    canInvite?: boolean;
  }
) {
  try {
    const session = await getVerifiedSession();

    const [member] = await db
      .select()
      .from(surveyTeamMembers)
      .where(eq(surveyTeamMembers.id, memberId));

    if (!member) {
      return {
        success: false,
        error: "Team member not found",
      };
    }

    // Verify ownership or permission
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, member.surveyId));

    if (!survey || survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Update member
    await db
      .update(surveyTeamMembers)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(surveyTeamMembers.id, memberId));

    // If Notion access changed, update permissions
    if (updates.notionAccess !== undefined) {
      if (updates.notionAccess) {
        await syncTeamMemberToNotion(
          member.surveyId,
          member.userId,
          updates.role || member.role
        );
      } else {
        await removeTeamMemberFromNotion(member.surveyId, member.userId);
      }
    }

    return {
      success: true,
      message: "Team member updated successfully",
    };
  } catch (error) {
    console.error("Error updating team member:", error);
    return {
      success: false,
      error: "Failed to update team member",
    };
  }
}

/**
 * Remove team member from survey
 */
export async function removeTeamMember(memberId: string) {
  try {
    const session = await getVerifiedSession();

    const [member] = await db
      .select()
      .from(surveyTeamMembers)
      .where(eq(surveyTeamMembers.id, memberId));

    if (!member) {
      return {
        success: false,
        error: "Team member not found",
      };
    }

    // Verify ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, member.surveyId));

    if (!survey || survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Remove from Notion first
    await removeTeamMemberFromNotion(member.surveyId, member.userId);

    // Remove from database
    await db
      .delete(surveyTeamMembers)
      .where(eq(surveyTeamMembers.id, memberId));

    return {
      success: true,
      message: "Team member removed successfully",
    };
  } catch (error) {
    console.error("Error removing team member:", error);
    return {
      success: false,
      error: "Failed to remove team member",
    };
  }
}

/**
 * Sync team member permissions to Notion
 */
async function syncTeamMemberToNotion(
  surveyId: string,
  userId: string,
  role: string
) {
  try {
    // Get all Notion pages for this survey
    const exports = await db
      .select()
      .from(notionExports)
      .where(eq(notionExports.surveyId, surveyId));

    if (exports.length === 0) {
      console.log("No Notion pages found for survey, skipping permission sync");
      return;
    }

    // Get survey owner's Notion client
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) return;

    const notion = await getNotionOAuthClient(survey.userId);
    if (!notion) return;

    // Determine permission type based on role
    const permissionType = role === "editor" ? "edit" : "read";

    // Add user to each Notion page
    for (const exp of exports) {
      try {
        // Note: This is a simplified version
        // In reality, you'd need to get the user's Notion user ID
        // which might require them to connect their Notion account

        // Track permission intent in database
        await db.insert(notionPagePermissions).values({
          id: crypto.randomUUID(),
          notionPageId: exp.notionPageId,
          userId,
          surveyId,
          permissionType,
          syncStatus: "pending",
        });

        // TODO: Actually update Notion page permissions
        // This requires the user's Notion user ID
        // await notion.pages.update({
        //   page_id: exp.notionPageId,
        //   permissions: [...]
        // });
      } catch (error) {
        console.error(
          `Failed to sync permissions for page ${exp.notionPageId}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Error syncing team member to Notion:", error);
  }
}

/**
 * Remove team member permissions from Notion
 */
async function removeTeamMemberFromNotion(surveyId: string, userId: string) {
  try {
    // Remove all permission records
    await db
      .delete(notionPagePermissions)
      .where(
        and(
          eq(notionPagePermissions.surveyId, surveyId),
          eq(notionPagePermissions.userId, userId)
        )
      );

    // TODO: Actually remove from Notion pages
  } catch (error) {
    console.error("Error removing team member from Notion:", error);
  }
}

/**
 * Get user's team memberships
 */
export async function getMyTeamMemberships() {
  try {
    const session = await getVerifiedSession();

    const memberships = await db
      .select({
        id: surveyTeamMembers.id,
        surveyId: surveyTeamMembers.surveyId,
        surveyTitle: surveys.title,
        role: surveyTeamMembers.role,
        notionAccess: surveyTeamMembers.notionAccess,
        canSync: surveyTeamMembers.canSync,
        acceptedAt: surveyTeamMembers.acceptedAt,
        createdAt: surveyTeamMembers.createdAt,
      })
      .from(surveyTeamMembers)
      .leftJoin(surveys, eq(surveyTeamMembers.surveyId, surveys.id))
      .where(eq(surveyTeamMembers.userId, session.user.id))
      .orderBy(surveyTeamMembers.createdAt);

    return {
      success: true,
      memberships,
    };
  } catch (error) {
    console.error("Error getting team memberships:", error);
    return {
      success: false,
      error: "Failed to get team memberships",
      memberships: [],
    };
  }
}
