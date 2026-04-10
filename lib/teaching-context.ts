import type { AuthSessionWithUser } from "@/lib/auth";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getWorkspaceCapabilities,
  getWorkspaceMembership,
  getWorkspaceProfile,
} from "@/lib/workspace-access";

export type TeachingContext =
  | {
      scope: "personal";
      organizationId: null;
      session: AuthSessionWithUser;
      workspace: null;
    }
  | {
      scope: "workspace";
      organizationId: string;
      session: AuthSessionWithUser;
      workspace: {
        membershipId: string;
        role: string;
        profile: Awaited<ReturnType<typeof getWorkspaceProfile>>;
        capabilities: ReturnType<typeof getWorkspaceCapabilities>;
      };
    };

export async function getTeachingContext(): Promise<TeachingContext> {
  const session = await getVerifiedSession();
  const organizationId = session.session.activeOrganizationId ?? null;

  if (!organizationId) {
    return {
      scope: "personal",
      organizationId: null,
      session,
      workspace: null,
    };
  }

  const membership = await getWorkspaceMembership(session.user.id, organizationId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const profile = await getWorkspaceProfile(organizationId);
  const capabilities = getWorkspaceCapabilities({
    role: membership.role as Parameters<typeof getWorkspaceCapabilities>[0]["role"],
    profile,
  });

  return {
    scope: "workspace",
    organizationId,
    session,
    workspace: {
      membershipId: membership.id,
      role: membership.role,
      profile,
      capabilities,
    },
  };
}
