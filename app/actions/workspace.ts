"use server";

/**
 * Workspace Management Actions
 *
 * Server actions for managing workspaces (organizations) using Better Auth
 */

import { auth } from "@/lib/auth";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { organizations, members } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type ActionResult<T> =
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
    await getVerifiedSession();

    // Use Better Auth API to create organization
    const result = await auth.api.createOrganization({
      body: {
        name: data.name,
        slug: data.slug,
      },
      headers: await getSessionHeaders(),
    });

    if (!result.data) {
      return {
        success: false,
        error: "Failed to create workspace",
      };
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        name: result.data.name,
        slug: result.data.slug,
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

    if (!result.data) {
      return {
        success: true,
        data: [],
      };
    }

    return {
      success: true,
      data: result.data.map((org: any) => ({
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
        error instanceof Error
          ? error.message
          : "Failed to get workspaces",
      data: [],
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
  } | null>
> {
  try {
    await getVerifiedSession();

    // Use Better Auth API to get active organization
    const result = await auth.api.getActiveOrganization({
      headers: await getSessionHeaders(),
    });

    if (!result.data) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: {
        id: result.data.id,
        name: result.data.name,
        slug: result.data.slug,
        role: (result.data as any).role || "member",
        logo: result.data.logo || null,
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
      data: null,
    };
  }
}

/**
 * Set active workspace
 */
export async function setActiveWorkspace(
  organizationId: string | null
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
  role?: "owner" | "member";
  organizationId?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  try {
    const session = await getVerifiedSession();

    // Use Better Auth API to invite member
    const result = await auth.api.inviteMember({
      body: {
        email: data.email,
        role: data.role || "member",
        organizationId: data.organizationId,
      },
      headers: await getSessionHeaders(),
    });

    if (!result.data) {
      return {
        success: false,
        error: "Failed to send invitation",
      };
    }

    return {
      success: true,
      data: {
        invitationId: result.data.id,
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
    await getVerifiedSession();

    // Use Better Auth API to remove member
    await auth.api.removeMember({
      body: {
        memberIdOrEmail: data.memberIdOrEmail,
        organizationId: data.organizationId,
      },
      headers: await getSessionHeaders(),
    });

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error removing workspace member:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove member",
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

    if (!result.data) {
      return {
        success: true,
        data: [],
      };
    }

    return {
      success: true,
      data: result.data.map((member: any) => ({
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
      data: [],
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
    await getVerifiedSession();

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

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    console.error("Error updating workspace:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update workspace",
    };
  }
}

/**
 * Leave workspace
 */
export async function leaveWorkspace(
  organizationId: string
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
  organizationId: string
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
        error instanceof Error
          ? error.message
          : "Failed to delete workspace",
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

