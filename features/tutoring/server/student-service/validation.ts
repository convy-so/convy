import { and, eq, gt, isNull, or } from "drizzle-orm";

import { logAuthAuditEvent } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import { classroomInvitations, classroomStudents, users } from "@/shared/db/schema";

import {
  type InvitationValidationError,
  PENDING_INVITE_STATUS,
} from "./invitation-model";

export async function validateStudentsForInvitation(params: {
  classroomId: string;
  invitedByUserId: string;
  emails: string[];
}) {
  console.log("[student-service] validateStudentsForInvitation called", {
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    emailCount: params.emails.length,
    emails: params.emails,
  });

  const inviter = await getDb().query.users.findFirst({
    where: eq(users.id, params.invitedByUserId),
  });

  const normalizedInviterEmail = inviter?.email.trim().toLowerCase();
  const normalizedEmails = params.emails.map((email) => email.trim().toLowerCase());

  const invalid: InvitationValidationError[] = [];
  const valid: string[] = [];

  for (const email of normalizedEmails) {
    if (email === normalizedInviterEmail) {
      console.log(
        `[student-service] validateStudentsForInvitation: ${email} blocked (self-invite)`,
      );
      invalid.push({ email, reason: "self" });
      continue;
    }

    const existingUser = await getDb().query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser && existingUser.role !== "student") {
      logAuthAuditEvent("staff_invitation_blocked", {
        classroomId: params.classroomId,
        invitedEmail: email,
        currentRole: existingUser.role,
        userId: existingUser.id,
      });
      console.log(
        `[student-service] validateStudentsForInvitation: ${email} blocked (staff_account, role=${existingUser.role})`,
      );
      invalid.push({ email, reason: "staff_account" });
      continue;
    }

    const existingMembership = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, params.classroomId),
        eq(classroomStudents.email, email),
      ),
    });

    if (existingMembership) {
      console.log(
        `[student-service] validateStudentsForInvitation: ${email} blocked (already_member)`,
      );
      invalid.push({ email, reason: "already_member" });
      continue;
    }

    const now = new Date();
    const existingPendingInvitation = await getDb().query.classroomInvitations.findFirst({
      where: and(
        eq(classroomInvitations.classroomId, params.classroomId),
        eq(classroomInvitations.invitedEmail, email),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
        or(
          isNull(classroomInvitations.expiresAt),
          gt(classroomInvitations.expiresAt, now),
        ),
      ),
    });

    if (existingPendingInvitation) {
      const expiresLabel = existingPendingInvitation.expiresAt
        ? existingPendingInvitation.expiresAt.toISOString()
        : "never";
      console.log(
        `[student-service] validateStudentsForInvitation: ${email} blocked (already_invited, invitationId=${existingPendingInvitation.id}, expiresAt=${expiresLabel})`,
      );
      invalid.push({ email, reason: "already_invited" });
      continue;
    }

    console.log(`[student-service] validateStudentsForInvitation: ${email} valid`);
    valid.push(email);
  }

  console.log("[student-service] validateStudentsForInvitation result", {
    classroomId: params.classroomId,
    valid,
    invalidCount: invalid.length,
    invalid,
  });

  return { valid, invalid };
}
