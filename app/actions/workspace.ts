"use server";

/**
 * Workspace Management Actions
 *
 * Server actions for managing workspaces (organizations) using Better Auth
 */

import { auth } from "@/lib/auth";
import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import {
  organizations,
  members,
  invitations,
  users,
  projects,
  surveys,
  surveyEditors,
  surveyEditLeases,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import {
  publishPendingOutboxEntries,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Create a new workspace
 */
export async function createWorkspace(data: {
  name: string;
  slug: string;
}): Promise<ActionResult<{ id: string; name: string; slug: string }>> {
  try {
    const session = await getVerifiedSession();

    // --- WORKSPACE LIMIT CHECK ---
    const userOwnedWorkspaces = await getDb()
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.userId, session.user.id), eq(members.role, "owner")));

    if (userOwnedWorkspaces.length >= 2) {
      return {
        success: false,
        error: "Limit reached: You can only create up to 2 workspaces per person.",
      };
    }
    // --- END WORKSPACE LIMIT CHECK ---

    // Use Better Auth API to create organization
    const result = await auth.api.createOrganization({
      body: {
        name: data.name,
        slug: data.slug,
      },
      headers: await getSessionHeaders(),
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to create workspace",
      };
    }

    return {
      success: true,
      data: {
        id: result.id,
        name: result.name,
        slug: result.slug,
      },
    };
  } catch (error) {
    console.error("Error creating workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create workspace",
    };
  }
}

/**
 * Get all workspaces for the current user
 */
export async function getUserWorkspaces(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
      logo?: string | null;
    }>
  >
> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to list organizations
    const result = await auth.api.listOrganizations({
      headers: await getSessionHeaders(),
    });

    if (!result) {
      return {
        success: true,
        data: [],
      };
    }

    return {
      success: true,
      data: result.map((org: any) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: org.role || "member",
        logo: org.logo || null,
      })),
    };
  } catch (error) {
    console.error("Error getting workspaces:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get workspaces",
    };
  }
}

/**
 * Get active workspace
 */
export async function getActiveWorkspace(): Promise<
  ActionResult<{
    id: string;
    name: string;
    slug: string;
    role: string;
    logo?: string | null;
    plan?: string | null;
  } | null>
> {
  try {
    const session = await getVerifiedSession();

    // Get active organization ID from session
    // Note: session.session has activeOrganizationId added by the organization plugin
    const activeOrganizationId = (session.session as any)
      .activeOrganizationId as string | null | undefined;

    if (!activeOrganizationId) {
      return {
        success: true,
        data: null,
      };
    }

    const org = await getDb().query.organizations.findFirst({
      where: eq(organizations.id, activeOrganizationId),
    });

    if (!org) {
      return {
        success: true,
        data: null,
      };
    }

    const member = await getDb().query.members.findFirst({
      where: and(
        eq(members.organizationId, activeOrganizationId),
        eq(members.userId, session.user.id),
      ),
    });

    return {
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: member?.role || "member",
        logo: org.logo || null,
        plan: "Free",
      },
    };
  } catch (error) {
    console.error("Error getting active workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get active workspace",
    };
  }
}

/**
 * Set active workspace
 */
export async function setActiveWorkspace(
  organizationId: string | null,
): Promise<ActionResult<void>> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to set active organization
    await auth.api.setActiveOrganization({
      body: {
        organizationId,
      },
      headers: await getSessionHeaders(),
    });

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error setting active workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to set active workspace",
    };
  }
}

/**
 * Invite a user to the workspace
 */
export async function inviteToWorkspace(data: {
  email: string;
  role?: "member";
  organizationId?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  try {
    const session = await getVerifiedSession();
    const normalizedEmail = data.email.trim().toLowerCase();
    const organizationId =
      data.organizationId ||
      ((session.session as any).activeOrganizationId as string | undefined);

    if (!organizationId) {
      return {
        success: false,
        error: "No active workspace selected",
      };
    }

    if (data.role && data.role !== "member") {
      return {
        success: false,
        error: "Invalid role: workspace invitations can only grant member access",
      };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can invite members",
      };
    }

    const existingPendingInvite =
      await getDb().query.invitations.findFirst({
        where: and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.status, "pending"),
          sql`lower(${invitations.email}) = ${normalizedEmail}`,
        ),
      });

    if (existingPendingInvite) {
      return {
        success: false,
        error: "An invitation has already been sent to this email",
      };
    }

    const existingUser = await getDb().query.users.findFirst({
      where: sql`lower(${users.email}) = ${normalizedEmail}`,
    });

    if (existingUser) {
      const existingMember = await getDb().query.members.findFirst({
        where: and(
          eq(members.organizationId, organizationId),
          eq(members.userId, existingUser.id),
        ),
      });

      if (existingMember) {
        return {
          success: false,
          error: "This user is already a member of the workspace",
        };
      }
    }

    // Use Better Auth API to invite member
    const result = await auth.api.createInvitation({
      body: {
        email: normalizedEmail,
        role: "member",
        organizationId,
      },
      headers: await getSessionHeaders(),
    });

    if (!result || !result.id) {
      return {
        success: false,
        error: "Failed to send invitation",
      };
    }

    return {
      success: true,
      data: {
        invitationId: result.id as string,
      },
    };
  } catch (error) {
    console.error("Error inviting to workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to send invitation",
    };
  }
}

/**
 * Remove a member from the workspace
 */
export async function removeWorkspaceMember(data: {
  memberIdOrEmail: string;
  organizationId?: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const organizationId =
      data.organizationId ||
      ((session.session as any).activeOrganizationId as string | undefined);

    if (!organizationId) {
      return {
        success: false,
        error: "No active workspace selected",
      };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can remove members",
      };
    }

    const targetMember = await getDb().query.members.findFirst({
      where: and(
        eq(members.organizationId, organizationId),
        eq(members.userId, data.memberIdOrEmail),
      ),
    });

    if (targetMember?.role === "owner") {
      return {
        success: false,
        error: "The workspace owner cannot be removed from the workspace",
      };
    }

    if (targetMember) {
      const [ownedSurveys, ownedProjects] = await Promise.all([
        getDb()
          .select({ id: surveys.id })
          .from(surveys)
          .where(
            and(
              eq(surveys.organizationId, organizationId),
              eq(surveys.userId, targetMember.userId),
            ),
          ),
        getDb()
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.organizationId, organizationId),
              eq(projects.userId, targetMember.userId),
            ),
          ),
      ]);

      if (ownedSurveys.length > 0 || ownedProjects.length > 0) {
        return {
          success: false,
          error:
            "This member still owns surveys or projects. Transfer ownership before removing them.",
        };
      }

    }

    // Use Better Auth API to remove member
    await auth.api.removeMember({
      body: {
        memberIdOrEmail: data.memberIdOrEmail,
        organizationId,
      },
      headers: await getSessionHeaders(),
    });
    if (targetMember) {
      const workspaceSurveyIds = await getDb()
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.organizationId, organizationId));

      await Promise.all(
        workspaceSurveyIds.map(async ({ id }) => {
          await getDb()
            .delete(surveyEditors)
            .where(
              and(
                eq(surveyEditors.surveyId, id),
                eq(surveyEditors.userId, targetMember.userId),
              ),
            );
          await getDb()
            .delete(surveyEditLeases)
            .where(
              and(
                eq(surveyEditLeases.surveyId, id),
                eq(surveyEditLeases.holderUserId, targetMember.userId),
              ),
            );
        }),
      );

      await getDb().transaction(async (tx) => {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: organizationId,
          eventType: "workspace.member_removed",
          actorId: session.user.id,
          payload: {
            workspaceId: organizationId,
            memberId: targetMember.id,
            userId: targetMember.userId,
          },
        });
      });
      await publishPendingOutboxEntries();
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error removing workspace member:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove member",
    };
  }
}

/**
 * Get workspace members
 */
export async function getWorkspaceMembers(data?: {
  organizationId?: string;
  limit?: number;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      userId: string;
      role: string;
      user: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
      };
    }>
  >
> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to list members
    const result = await auth.api.listMembers({
      query: {
        organizationId: data?.organizationId,
        limit: data?.limit || 100,
      },
      headers: await getSessionHeaders(),
    });

    if (!result) {
      return {
        success: true,
        data: [],
      };
    }

    return {
      success: true,
      data: result.members.map((member: any) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          image: member.user.image || null,
        },
      })),
    };
  } catch (error) {
    console.error("Error getting workspace members:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get workspace members",
    };
  }
}

/**
 * Update workspace details
 */
export async function updateWorkspace(data: {
  organizationId: string;
  name?: string;
  slug?: string;
  logo?: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    // Enforce owner-only access
    const isOwner = await isWorkspaceOwner(
      session.user.id,
      data.organizationId,
    );
    if (!isOwner) {
      return { success: false, error: "Unauthorized: Owner access required" };
    }

    // Use Better Auth API to update organization
    await auth.api.updateOrganization({
      body: {
        organizationId: data.organizationId,
        data: {
          name: data.name,
          slug: data.slug,
          logo: data.logo,
        },
      },
      headers: await getSessionHeaders(),
    });

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "workspace",
        workspaceId: data.organizationId,
        eventType: "workspace.settings_updated",
        actorId: session.user.id,
        payload: {
          workspaceId: data.organizationId,
          updates: {
            name: data.name,
            slug: data.slug,
            logo: data.logo,
          },
        },
      });
    });
    await publishPendingOutboxEntries();

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error updating workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update workspace",
    };
  }
}

/**
 * Leave workspace
 */
export async function leaveWorkspace(
  organizationId: string,
): Promise<ActionResult<void>> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to leave organization
    await auth.api.leaveOrganization({
      body: {
        organizationId,
      },
      headers: await getSessionHeaders(),
    });

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error leaving workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to leave workspace",
    };
  }
}

/**
 * Delete workspace (owner only)
 */
export async function deleteWorkspace(
  organizationId: string,
): Promise<ActionResult<void>> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to delete organization
    await auth.api.deleteOrganization({
      body: {
        organizationId,
      },
      headers: await getSessionHeaders(),
    });

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete workspace",
    };
  }
}

/**
 * Helper to get session headers for Better Auth API calls
 */
async function getSessionHeaders(): Promise<Headers> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const headers = new Headers();

  // Copy all cookies to headers
  cookieStore.getAll().forEach((cookie) => {
    headers.append("Cookie", `${cookie.name}=${cookie.value}`);
  });

  return headers;
}

/**
 * Get workspace invitations
 */
export async function getWorkspaceInvitations(organizationId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      createdAt: Date;
      inviterName: string;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can view invitations",
      };
    }

    const workspaceMembers = await getDb().query.members.findMany({
      where: eq(members.organizationId, organizationId),
      with: {
        user: {
          columns: {
            email: true,
          },
        },
      },
    });

    const memberEmails = new Set(
      workspaceMembers.map((member) => member.user.email.toLowerCase()),
    );

    const invites = await getDb().query.invitations.findMany({
      where: and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.status, "pending"),
      ),
      orderBy: [desc(invitations.createdAt)],
      with: {
        inviter: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      data: invites
        .filter((invite) => !memberEmails.has(invite.email.toLowerCase()))
        .map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          createdAt: invite.createdAt,
          inviterName: invite.inviter.name || invite.inviter.email,
        })),
    };
  } catch (error) {
    console.error("Error getting workspace invitations:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get workspace invitations",
    };
  }
}
/**
 * Accept a workspace invitation
 */
export async function acceptInvitationAction(
  invitationId: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const invitation = await getDb().query.invitations.findFirst({
      where: eq(invitations.id, invitationId),
    });

    await auth.api.acceptInvitation({
      body: {
        invitationId,
      },
      headers: await getSessionHeaders(),
    });

    if (invitation?.organizationId) {
      await getDb().transaction(async (tx) => {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: invitation.organizationId,
          eventType: "workspace.member_added",
          actorId: session.user.id,
          payload: {
            workspaceId: invitation.organizationId,
            userId: session.user.id,
            email: session.user.email,
          },
        });
      });
      await publishPendingOutboxEntries();
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to accept invitation",
    };
  }
}
