import "server-only";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";
import { getPlatformRole } from "@/lib/auth/roles";
import {
  getExpertInvitationById,
  isExpertInvitationExpired,
  type ExpertInvitationRecord,
} from "@/lib/auth/expert-invitations";
import { eq } from "drizzle-orm";

type InvitationBase = {
  invitationId: string;
  invitedEmail: string;
  locale: string;
  expiresAt: string;
};

export type ExpertInvitationAccessState =
  | ({ kind: "not_found" } & Partial<InvitationBase>)
  | ({ kind: "expired" } & InvitationBase)
  | ({ kind: "cancelled" } & InvitationBase)
  | ({ kind: "pending_signed_out" } & InvitationBase)
  | ({ kind: "pending_wrong_account"; currentEmail: string } & InvitationBase)
  | ({ kind: "pending_unverified"; currentEmail: string } & InvitationBase)
  | ({ kind: "pending_password_setup"; currentEmail: string } & InvitationBase)
  | ({ kind: "completed" } & InvitationBase);

function toBase(invitation: ExpertInvitationRecord): InvitationBase {
  return {
    invitationId: invitation.id,
    invitedEmail: invitation.invitedEmail,
    locale: invitation.locale,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function resolveExpertInvitationAccess(params: {
  invitationId: string;
  session: AuthSessionWithUser | null;
}): Promise<ExpertInvitationAccessState> {
  console.log("[expert-invite] resolve:start", {
    invitationId: params.invitationId,
    hasSession: Boolean(params.session),
    sessionUserId: params.session?.user.id ?? null,
    sessionEmail: params.session?.user.email ?? null,
    sessionRole: params.session ? getPlatformRole(params.session.user) : null,
    emailVerified: params.session?.user.emailVerified ?? null,
  });

  const invitation = await getExpertInvitationById(params.invitationId);
  if (!invitation) {
    console.log("[expert-invite] resolve:not_found", {
      invitationId: params.invitationId,
    });
    return { kind: "not_found", invitationId: params.invitationId };
  }

  const base = toBase(invitation);
  console.log("[expert-invite] resolve:invitation_loaded", {
    invitationId: invitation.id,
    invitedUserId: invitation.invitedUserId,
    invitedEmail: invitation.invitedEmail,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
  });

  if (invitation.status === "completed") {
    console.log("[expert-invite] resolve:completed", {
      invitationId: invitation.id,
    });
    return { kind: "completed", ...base };
  }

  if (invitation.status === "cancelled") {
    console.log("[expert-invite] resolve:cancelled", {
      invitationId: invitation.id,
    });
    return { kind: "cancelled", ...base };
  }

  if (isExpertInvitationExpired(invitation)) {
    console.log("[expert-invite] resolve:expired", {
      invitationId: invitation.id,
    });
    return { kind: "expired", ...base };
  }

  if (!params.session) {
    console.log("[expert-invite] resolve:signed_out", {
      invitationId: invitation.id,
      invitedEmail: invitation.invitedEmail,
    });
    return { kind: "pending_signed_out", ...base };
  }

  const currentEmail = params.session.user.email.trim().toLowerCase();
  if (currentEmail !== invitation.invitedEmail) {
    console.log("[expert-invite] resolve:email_mismatch", {
      invitationId: invitation.id,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      currentUserId: params.session.user.id,
      currentEmail,
      currentRole: getPlatformRole(params.session.user),
    });
    return { kind: "pending_wrong_account", currentEmail, ...base };
  }

  const role = getPlatformRole(params.session.user);
  if (role !== "expert") {
    console.log("[expert-invite] resolve:role_mismatch", {
      invitationId: invitation.id,
      invitedEmail: invitation.invitedEmail,
      currentUserId: params.session.user.id,
      currentEmail,
      currentRole: role,
    });
    return { kind: "pending_wrong_account", currentEmail, ...base };
  }

  if (params.session.user.id !== invitation.invitedUserId) {
    console.log("[expert-invite] resolve:user_id_mismatch", {
      invitationId: invitation.id,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      currentUserId: params.session.user.id,
      currentEmail,
    });
    return { kind: "pending_wrong_account", currentEmail, ...base };
  }

  const invitedUser = await getDb().query.users.findFirst({
    where: eq(users.id, invitation.invitedUserId),
  });

  if (!invitedUser || invitedUser.email !== invitation.invitedEmail) {
    console.log("[expert-invite] resolve:invited_user_record_mismatch", {
      invitationId: invitation.id,
      invitedUserId: invitation.invitedUserId,
      invitedEmail: invitation.invitedEmail,
      foundUserId: invitedUser?.id ?? null,
      foundUserEmail: invitedUser?.email ?? null,
    });
    return { kind: "pending_wrong_account", currentEmail, ...base };
  }

  if (!params.session.user.emailVerified) {
    console.log("[expert-invite] resolve:pending_unverified", {
      invitationId: invitation.id,
      currentUserId: params.session.user.id,
      currentEmail,
    });
    return { kind: "pending_unverified", currentEmail, ...base };
  }

  console.log("[expert-invite] resolve:pending_password_setup", {
    invitationId: invitation.id,
    currentUserId: params.session.user.id,
    currentEmail,
  });
  return { kind: "pending_password_setup", currentEmail, ...base };
}
