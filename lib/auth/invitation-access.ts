import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { classroomInvitations, classroomStudents, users } from "@/db/schema";
import type { AuthSessionWithUser } from "@/lib/auth";
import { logAuthAuditEvent } from "@/lib/auth/audit";
import { getPlatformRole } from "@/lib/auth/roles";

type InvitationBase = {
  invitationId: string;
  invitedEmail: string;
  classroomId: string;
  classroomTitle: string;
  expiresAt: string | null;
};

export type InvitationAccessState =
  | ({ kind: "not_found" } & Partial<InvitationBase>)
  | ({ kind: "pending_signed_out" } & InvitationBase)
  | ({ kind: "pending_review" } & InvitationBase)
  | ({ kind: "pending_wrong_account"; currentEmail: string } & InvitationBase)
  | ({ kind: "pending_staff_blocked"; currentEmail: string; currentRole: string } & InvitationBase)
  | ({ kind: "pending_verification"; currentEmail: string } & InvitationBase)
  | ({ kind: "terminal"; reason: "expired" | "cancelled" | "rejected" } & InvitationBase)
  | ({ kind: "joined" } & InvitationBase)
  | ({ kind: "unavailable"; reason: "accepted_by_other" | "accepted_elsewhere" } & InvitationBase);

function isExpired(expiresAt: Date | null): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

export async function resolveInvitationAccess(params: {
  invitationId: string;
  session: AuthSessionWithUser | null;
}): Promise<InvitationAccessState> {
  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: eq(classroomInvitations.id, params.invitationId),
    with: {
      classroom: {
        columns: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!invitation || !invitation.classroom) {
    return { kind: "not_found", invitationId: params.invitationId };
  }

  const base: InvitationBase = {
    invitationId: invitation.id,
    invitedEmail: invitation.invitedEmail,
    classroomId: invitation.classroomId,
    classroomTitle: invitation.classroom.title,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
  };

  if (invitation.status === "cancelled" || invitation.status === "rejected") {
    return { kind: "terminal", reason: invitation.status, ...base };
  }

  if (invitation.status === "accepted") {
    if (params.session?.user.id && invitation.acceptedByUserId === params.session.user.id) {
      return { kind: "joined", ...base };
    }

    return { kind: "unavailable", reason: "accepted_by_other", ...base };
  }

  if (isExpired(invitation.expiresAt ?? null)) {
    return { kind: "terminal", reason: "expired", ...base };
  }

  if (!params.session) {
    return { kind: "pending_signed_out", ...base };
  }

  const currentEmail = params.session.user.email.trim().toLowerCase();
  if (currentEmail !== invitation.invitedEmail) {
    logAuthAuditEvent("invite_email_mismatch", {
      invitationId: invitation.id,
      invitedEmail: invitation.invitedEmail,
      currentEmail,
      userId: params.session.user.id,
    });
    return { kind: "pending_wrong_account", currentEmail, ...base };
  }

  if (!params.session.user.emailVerified) {
    return { kind: "pending_verification", currentEmail, ...base };
  }

  const role = getPlatformRole(params.session.user);
  if (role !== "student") {
    logAuthAuditEvent("staff_invitation_blocked", {
      invitationId: invitation.id,
      invitedEmail: invitation.invitedEmail,
      currentEmail,
      currentRole: role,
      userId: params.session.user.id,
    });
    return {
      kind: "pending_staff_blocked",
      currentEmail,
      currentRole: role,
      ...base,
    };
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.userId, params.session.user.id),
  });

  if (membership && membership.classroomId === invitation.classroomId) {
    return { kind: "joined", ...base };
  }

  return { kind: "pending_review", ...base };
}

export async function findUserByNormalizedEmail(email: string) {
  return getDb().query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
}
