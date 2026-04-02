"use server";

/**
 * Workspace Management Actions
 *
 * Server actions for managing workspaces (organizations) using Better Auth
 */

import { auth } from "@/lib/auth";
import { nanoid } from "nanoid";
import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import {
  classrooms,
  departments,
  organizations,
  members,
  invitations,
  users,
  projects,
  surveys,
  surveyEditors,
  surveyEditLeases,
} from "@/db/schema";
import { eq, and, desc, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import {
  defaultWorkspaceLocaleSettings,
  normalizeAppLocale,
  type WorkspaceLocaleSettings,
} from "@/lib/i18n/config";
import {
  getWorkspaceLocaleSettings,
  normalizeWorkspaceLocaleSettings,
  upsertWorkspaceLocaleSettings,
} from "@/lib/i18n/workspace-settings";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const departmentNamePattern = /^[A-Za-z0-9][A-Za-z0-9 &/-]{1,79}$/;
const workspaceLocalizationSchema = z.object({
  defaultUiLocale: z.enum(["en", "fr", "de", "es", "it"]),
  defaultContentLocale: z.enum(["en", "fr", "de", "es", "it"]),
  emailLocale: z.enum(["en", "fr", "de", "es", "it"]),
  allowedLocales: z.array(z.enum(["en", "fr", "de", "es", "it"])).min(1),
  autoTranslateGeneratedContent: z.boolean(),
});

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

    const creatorLocale = normalizeAppLocale(
      session.user.uiLocale ?? session.user.preferredLanguage,
    );
    await upsertWorkspaceLocaleSettings({
      organizationId: result.id,
      settings: {
        defaultUiLocale: creatorLocale,
        defaultContentLocale: creatorLocale,
        emailLocale: creatorLocale,
        allowedLocales: [...defaultWorkspaceLocaleSettings.allowedLocales],
        autoTranslateGeneratedContent:
          defaultWorkspaceLocaleSettings.autoTranslateGeneratedContent,
      },
    });

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
      data: result.map((org: { id: string; name: string; slug: string; role?: string; logo?: string | null }) => ({
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
    localization: WorkspaceLocaleSettings;
  } | null>
> {
  try {
    const session = await getVerifiedSession();

    // Get active organization ID from session
    const activeOrganizationId = session.session.activeOrganizationId;

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
    const localization =
      (await getWorkspaceLocaleSettings(activeOrganizationId)) ??
      { ...defaultWorkspaceLocaleSettings };

    return {
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: member?.role || "member",
        logo: org.logo || null,
        plan: "Free",
        localization,
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
      data.organizationId || session.session.activeOrganizationId;

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
        invitationId: result.id,
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
      data.organizationId || session.session.activeOrganizationId;

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
      data: result.members.map((member: {
        id: string;
        userId: string;
        role: string;
        user: {
          id: string;
          name: string;
          email: string;
          image?: string | null;
        };
      }) => ({
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

export async function getWorkspaceLocalizationSettingsAction(data?: {
  organizationId?: string;
}): Promise<ActionResult<WorkspaceLocaleSettings>> {
  try {
    const session = await getVerifiedSession();
    const organizationId =
      data?.organizationId || session.session.activeOrganizationId;

    if (!organizationId) {
      return {
        success: false,
        error: "No active workspace selected",
      };
    }

    const member = await getDb().query.members.findFirst({
      where: and(
        eq(members.organizationId, organizationId),
        eq(members.userId, session.user.id),
      ),
    });

    if (!member) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const localization =
      (await getWorkspaceLocaleSettings(organizationId)) ??
      { ...defaultWorkspaceLocaleSettings };

    return {
      success: true,
      data: localization,
    };
  } catch (error) {
    console.error("Error getting workspace localization settings:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get workspace localization settings",
    };
  }
}

export async function updateWorkspaceLocalizationSettingsAction(data: {
  organizationId?: string;
  settings: WorkspaceLocaleSettings;
}): Promise<ActionResult<WorkspaceLocaleSettings>> {
  try {
    const session = await getVerifiedSession();
    const organizationId =
      data.organizationId || session.session.activeOrganizationId;

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
        error:
          "Unauthorized: Only workspace owners can update workspace language settings",
      };
    }

    const parsedSettings = workspaceLocalizationSchema.parse(data.settings);
    const normalizedSettings = normalizeWorkspaceLocaleSettings(parsedSettings);
    const allowedLocales = Array.from(
      new Set([
        ...normalizedSettings.allowedLocales,
        normalizedSettings.defaultContentLocale,
        normalizedSettings.emailLocale,
      ]),
    );
    const localization: WorkspaceLocaleSettings = {
      ...normalizedSettings,
      allowedLocales,
    };
    await upsertWorkspaceLocaleSettings({
      organizationId,
      settings: localization,
    });

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "workspace",
        workspaceId: organizationId,
        eventType: "workspace.settings_updated",
        actorId: session.user.id,
        payload: {
          workspaceId: organizationId,
          localization,
        },
      });
    });

    return {
      success: true,
      data: localization,
    };
  } catch (error) {
    console.error("Error updating workspace localization settings:", error);
    return {
      success: false,
      error:
        error instanceof z.ZodError
          ? error.errors[0]?.message ??
            "Invalid workspace localization settings"
          : error instanceof Error
            ? error.message
            : "Failed to update workspace localization settings",
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

export async function createDepartment(data: {
  name: string;
  code?: string;
  description?: string;
  headUserId?: string | null;
  organizationId?: string;
}): Promise<
  ActionResult<{
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    headUserId: string | null;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const organizationId =
      data.organizationId || session.session.activeOrganizationId;

    if (!organizationId) {
      return { success: false, error: "No active workspace selected" };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can create departments",
      };
    }

    const normalizedName = data.name.trim();
    if (!departmentNamePattern.test(normalizedName)) {
      return { success: false, error: "Please provide a valid department name." };
    }

    const normalizedCode = data.code?.trim() || null;
    const normalizedDescription = data.description?.trim() || null;

    const existingDepartment = await getDb().query.departments.findFirst({
      where: and(
        eq(departments.organizationId, organizationId),
        sql`lower(${departments.name}) = ${normalizedName.toLowerCase()}`,
      ),
    });

    if (existingDepartment) {
      return {
        success: false,
        error: "A department with this name already exists in the workspace.",
      };
    }

    if (data.headUserId) {
      const headMember = await getDb().query.members.findFirst({
        where: and(
          eq(members.organizationId, organizationId),
          eq(members.userId, data.headUserId),
        ),
      });

      if (!headMember) {
        return {
          success: false,
          error: "The selected department head must belong to this workspace.",
        };
      }
    }

    const departmentId = `dept_${nanoid()}`;
    await getDb().insert(departments).values({
      id: departmentId,
      organizationId,
      name: normalizedName,
      code: normalizedCode,
      description: normalizedDescription,
      headUserId: data.headUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      success: true,
      data: {
        id: departmentId,
        name: normalizedName,
        code: normalizedCode,
        description: normalizedDescription,
        headUserId: data.headUserId ?? null,
      },
    };
  } catch (error) {
    console.error("Error creating department:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create department",
    };
  }
}

export async function getWorkspaceDepartments(data?: {
  organizationId?: string;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      headUserId: string | null;
      headName: string | null;
      classroomCount: number;
      surveyCount: number;
      folderCount: number;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const organizationId =
      data?.organizationId || session.session.activeOrganizationId;

    if (!organizationId) {
      return { success: true, data: [] };
    }

    const isMember = await getDb().query.members.findFirst({
      where: and(
        eq(members.organizationId, organizationId),
        eq(members.userId, session.user.id),
      ),
    });

    if (!isMember) {
      return { success: false, error: "Unauthorized" };
    }

    const rows = await getDb().query.departments.findMany({
      where: eq(departments.organizationId, organizationId),
      orderBy: (table, { asc }) => [asc(table.name)],
      with: {
        headUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const departmentIds = rows.map((department) => department.id);
    let classroomCounts: Array<{ departmentId: string | null; count: number }> = [];
    let surveyCounts: Array<{ departmentId: string | null; count: number }> = [];
    let folderCounts: Array<{ departmentId: string | null; count: number }> = [];

    if (departmentIds.length > 0) {
      [classroomCounts, surveyCounts, folderCounts] = await Promise.all([
        getDb()
          .select({
            departmentId: classrooms.departmentId,
            count: sql<number>`count(*)`,
          })
          .from(classrooms)
          .where(inArray(classrooms.departmentId, departmentIds))
          .groupBy(classrooms.departmentId),
        getDb()
          .select({
            departmentId: surveys.departmentId,
            count: sql<number>`count(*)`,
          })
          .from(surveys)
          .where(inArray(surveys.departmentId, departmentIds))
          .groupBy(surveys.departmentId),
        getDb()
          .select({
            departmentId: projects.departmentId,
            count: sql<number>`count(*)`,
          })
          .from(projects)
          .where(inArray(projects.departmentId, departmentIds))
          .groupBy(projects.departmentId),
      ]);
    }

    const classroomCountByDepartment = new Map(
      classroomCounts.flatMap((row) =>
        row.departmentId ? [[row.departmentId, Number(row.count)]] : [],
      ),
    );
    const surveyCountByDepartment = new Map(
      surveyCounts.flatMap((row) =>
        row.departmentId ? [[row.departmentId, Number(row.count)]] : [],
      ),
    );
    const folderCountByDepartment = new Map(
      folderCounts.flatMap((row) =>
        row.departmentId ? [[row.departmentId, Number(row.count)]] : [],
      ),
    );

    return {
      success: true,
      data: rows.map((department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
        description: department.description,
        headUserId: department.headUserId ?? null,
        headName:
          department.headUser?.name || department.headUser?.email || null,
        classroomCount: classroomCountByDepartment.get(department.id) ?? 0,
        surveyCount: surveyCountByDepartment.get(department.id) ?? 0,
        folderCount: folderCountByDepartment.get(department.id) ?? 0,
      })),
    };
  } catch (error) {
    console.error("Error getting departments:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get departments",
    };
  }
}

export async function updateDepartment(data: {
  departmentId: string;
  name: string;
  code?: string;
  description?: string;
  headUserId?: string | null;
}): Promise<
  ActionResult<{
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    headUserId: string | null;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const normalizedName = data.name.trim();
    if (!departmentNamePattern.test(normalizedName)) {
      return { success: false, error: "Please provide a valid department name." };
    }

    const department = await getDb().query.departments.findFirst({
      where: eq(departments.id, data.departmentId),
    });

    if (!department) {
      return { success: false, error: "Department not found." };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, department.organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can update departments",
      };
    }

    const existingDepartment = await getDb().query.departments.findFirst({
      where: and(
        eq(departments.organizationId, department.organizationId),
        sql`lower(${departments.name}) = ${normalizedName.toLowerCase()}`,
        ne(departments.id, department.id),
      ),
    });

    if (existingDepartment) {
      return {
        success: false,
        error: "A department with this name already exists in the workspace.",
      };
    }

    const nextHeadUserId = data.headUserId ?? null;
    if (nextHeadUserId) {
      const headMember = await getDb().query.members.findFirst({
        where: and(
          eq(members.organizationId, department.organizationId),
          eq(members.userId, nextHeadUserId),
        ),
      });

      if (!headMember) {
        return {
          success: false,
          error: "The selected department head must belong to this workspace.",
        };
      }
    }

    const normalizedCode = data.code?.trim() || null;
    const normalizedDescription = data.description?.trim() || null;

    await getDb()
      .update(departments)
      .set({
        name: normalizedName,
        code: normalizedCode,
        description: normalizedDescription,
        headUserId: nextHeadUserId,
        updatedAt: new Date(),
      })
      .where(eq(departments.id, department.id));

    return {
      success: true,
      data: {
        id: department.id,
        name: normalizedName,
        code: normalizedCode,
        description: normalizedDescription,
        headUserId: nextHeadUserId,
      },
    };
  } catch (error) {
    console.error("Error updating department:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update department",
    };
  }
}

export async function deleteDepartment(data: {
  departmentId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const department = await getDb().query.departments.findFirst({
      where: eq(departments.id, data.departmentId),
    });

    if (!department) {
      return { success: false, error: "Department not found." };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, department.organizationId);
    if (!isOwner) {
      return {
        success: false,
        error: "Unauthorized: Only workspace owners can delete departments",
      };
    }

    const [classroomUsage, surveyUsage, folderUsage] = await Promise.all([
      getDb()
        .select({ count: sql<number>`count(*)` })
        .from(classrooms)
        .where(eq(classrooms.departmentId, department.id)),
      getDb()
        .select({ count: sql<number>`count(*)` })
        .from(surveys)
        .where(eq(surveys.departmentId, department.id)),
      getDb()
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.departmentId, department.id)),
    ]);

    const classroomCount = Number(classroomUsage[0]?.count ?? 0);
    const surveyCount = Number(surveyUsage[0]?.count ?? 0);
    const folderCount = Number(folderUsage[0]?.count ?? 0);

    if (classroomCount > 0 || surveyCount > 0 || folderCount > 0) {
      return {
        success: false,
        error:
          "This department is still assigned to classrooms, surveys, or folders. Reassign them before deleting the department.",
      };
    }

    await getDb().delete(departments).where(eq(departments.id, department.id));

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error deleting department:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete department",
    };
  }
}
