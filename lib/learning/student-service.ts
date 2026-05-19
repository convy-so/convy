import { and, eq, gt, or, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { classroomInvitations, classrooms, classroomStudents, users } from "@/db/schema";
import { logAuthAuditEvent } from "@/lib/auth/audit";
import { EmailService } from "@/lib/email-service";
import { publishClassroomRealtimeEvent } from "@/lib/realtime";
import { ValidationError } from "@/lib/action-wrapper";

export type StudentInviteResult = {
  id: string;
  classroomId: string;
  email: string;
  inviteStatus: string;
};

const PENDING_INVITE_STATUS = "pending";

function normalizeStudentInviteInput(input: { email: string }) {
  return {
    normalizedEmail: input.email.trim().toLowerCase(),
  };
}

export type InvitationValidationError = {
  email: string;
  reason: "self" | "staff_account" | "already_member" | "already_invited";
};

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
  const normalizedEmails = params.emails.map((e) => e.trim().toLowerCase());

  const invalid: InvitationValidationError[] = [];
  const valid: string[] = [];

  for (const email of normalizedEmails) {
    // 1. Check for self-invites
    if (email === normalizedInviterEmail) {
      console.log(`[student-service] validateStudentsForInvitation: ${email} → BLOCKED (self-invite)`);
      invalid.push({ email, reason: "self" });
      continue;
    }

    // 2. Check for staff accounts (Admin, Expert, Teacher)
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
      console.log(`[student-service] validateStudentsForInvitation: ${email} → BLOCKED (staff_account, role=${existingUser.role})`);
      invalid.push({ email, reason: "staff_account" });
      continue;
    }

    // 3. Check if already an accepted member of THIS classroom
    const existingMembership = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, params.classroomId),
        eq(classroomStudents.email, email),
      ),
    });

    if (existingMembership) {
      console.log(`[student-service] validateStudentsForInvitation: ${email} → BLOCKED (already_member)`);
      invalid.push({ email, reason: "already_member" });
      continue;
    }

    // 4. Check if there is already a non-expired PENDING invitation for this email in this classroom.
    //    Expired invitations are treated as gone — re-inviting is allowed.
    const now = new Date();
    const existingPendingInvitation = await getDb().query.classroomInvitations.findFirst({
      where: and(
        eq(classroomInvitations.classroomId, params.classroomId),
        eq(classroomInvitations.invitedEmail, email),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
        // Only block if NOT expired: expiresAt is null (no expiry set) OR expiresAt is in the future
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
      console.log(`[student-service] validateStudentsForInvitation: ${email} → BLOCKED (already_invited, invitationId=${existingPendingInvitation.id}, expiresAt=${expiresLabel})`);
      invalid.push({ email, reason: "already_invited" });
      continue;
    }

    console.log(`[student-service] validateStudentsForInvitation: ${email} → VALID`);
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

/**
 * Invite a student email to a classroom.
 * Invitations are accepted by self-registered users via the sign-up flow.
 */
export async function inviteManagedStudentToClassroom(params: {
  classroomId: string;
  invitedByUserId: string;
  email: string;
}) {
  const { normalizedEmail } = normalizeStudentInviteInput({
    email: params.email,
  });

  console.log("[student-service] inviteManagedStudentToClassroom: START", {
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    email: normalizedEmail,
  });

  const validation = await validateStudentsForInvitation({
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    emails: [normalizedEmail],
  });

  if (validation.invalid.length > 0) {
    const error = validation.invalid[0];
    console.warn("[student-service] inviteManagedStudentToClassroom: validation blocked", {
      email: normalizedEmail,
      reason: error.reason,
    });
    if (error.reason === "self") {
      throw new ValidationError("You cannot invite yourself to your own classroom.");
    }
    if (error.reason === "staff_account") {
      throw new ValidationError("This email is associated with a teacher or staff account and cannot be invited as a student.");
    }
    if (error.reason === "already_member") {
      throw new ValidationError("That student email is already attached to this classroom.");
    }
    if (error.reason === "already_invited") {
      throw new ValidationError("An active invitation already exists for this email.");
    }
  }

  // Fetch classroom details for the email
  const classroom = await getDb().query.classrooms.findFirst({
    where: eq(classrooms.id, params.classroomId),
  });

  if (!classroom) {
    console.error("[student-service] inviteManagedStudentToClassroom: classroom not found", {
      classroomId: params.classroomId,
    });
    throw new Error("Classroom not found.");
  }

  // Check for an existing PENDING invitation (including expired ones that weren't caught by the validator's block)
  const existingInvitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.invitedEmail, normalizedEmail),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
  });

  let invitationId = nanoid();
  const now = new Date();
  const INVITATION_TTL_DAYS = 7;
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  if (existingInvitation) {
    // If we are here, it means validateStudentsForInvitation didn't block it (so it's expired)
    // or we're in a race condition. We'll update the existing record to avoid unique index conflict.
    invitationId = existingInvitation.id;
    console.log("[student-service] inviteManagedStudentToClassroom: updating existing expired invitation", {
      invitationId,
      email: normalizedEmail,
    });

    await getDb()
      .update(classroomInvitations)
      .set({
        invitedByUserId: params.invitedByUserId,
        expiresAt,
        createdAt: now, // Reset to now so it appears at the top of the list
        updatedAt: now,
      })
      .where(eq(classroomInvitations.id, invitationId));
  } else {
    // No existing pending invite, safe to insert new record
    console.log("[student-service] inviteManagedStudentToClassroom: creating NEW invitation record", {
      invitationId,
      classroomId: params.classroomId,
      email: normalizedEmail,
    });

    await getDb().insert(classroomInvitations).values({
      id: invitationId,
      classroomId: params.classroomId,
      invitedByUserId: params.invitedByUserId,
      invitedEmail: normalizedEmail,
      status: PENDING_INVITE_STATUS,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Dispatch the invitation email
  try {
    const job = await EmailService.sendStudentInvitationEmail({
      email: normalizedEmail,
      invitationId: invitationId,
      classroomName: classroom.title,
    });

    if (!job) {
      // BullMQ returns null when a job with the same jobId already exists (deduplication).
      // The DB record was created but no new email job was enqueued.
      console.warn("[student-service] inviteManagedStudentToClassroom: email job was DEDUPLICATED by BullMQ (job already exists in queue)", {
        invitationId: invitationId,
        email: normalizedEmail,
        classroomId: params.classroomId,
      });
    } else {
      console.log("[student-service] inviteManagedStudentToClassroom: email job enqueued successfully", {
        invitationId: invitationId,
        email: normalizedEmail,
        jobId: job.id,
      });
    }
  } catch (error) {
    // We log the error but don't fail the whole action,
    // as the record is in the DB and can be resent later if needed.
    console.error("[student-service] inviteManagedStudentToClassroom: FAILED to enqueue invitation email", {
      invitationId: invitationId,
      email: normalizedEmail,
      classroomId: params.classroomId,
      classroomName: classroom.title,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  console.log("[student-service] inviteManagedStudentToClassroom: DONE", {
    invitationId: invitationId,
    email: normalizedEmail,
  });

  void publishClassroomRealtimeEvent(params.classroomId, {
    type: "classroom_roster_updated",
    reason: "invitation_sent",
    invitationId,
    email: normalizedEmail,
  });

  return {
    id: invitationId,
    classroomId: params.classroomId,
    email: normalizedEmail,
    inviteStatus: PENDING_INVITE_STATUS,
  };
}

export async function listPendingInvitationsForUser(userId: string) {
  const user = await getDb().query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return [];
  const normalizedEmail = user.email.trim().toLowerCase();
  try {
    return await getDb().query.classroomInvitations.findMany({
      where: and(
        eq(classroomInvitations.invitedEmail, normalizedEmail),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      ),
      with: { classroom: true },
    });
  } catch (error) {
    console.warn("[student-service] listPendingInvitationsForUser: failed to list pending invitations", {
      userId,
      email: normalizedEmail,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function respondToInvitation(params: {
  invitationId: string;
  userId: string;
  decision: "accepted" | "rejected";
}) {
  console.log("[student-service] respondToInvitation: START", {
    invitationId: params.invitationId,
    userId: params.userId,
    decision: params.decision,
  });

  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: eq(classroomInvitations.id, params.invitationId),
  });
  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  if (invitation.status !== PENDING_INVITE_STATUS) {
    const isIdempotentAccept =
      params.decision === "accepted" &&
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === params.userId;
    const isIdempotentReject =
      params.decision === "rejected" && invitation.status === "rejected";

    if (isIdempotentAccept || isIdempotentReject) {
      logAuthAuditEvent("invite_acceptance_replay", {
        invitationId: params.invitationId,
        userId: params.userId,
        decision: params.decision,
        currentStatus: invitation.status,
      });
      console.warn("[student-service] respondToInvitation: idempotent replay", {
        invitationId: params.invitationId,
        userId: params.userId,
        decision: params.decision,
        currentStatus: invitation.status,
      });
      return;
    }

    throw new Error("Invitation not found or no longer pending.");
  }

  const user = await getDb().query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user || user.email.trim().toLowerCase() !== invitation.invitedEmail) {
    logAuthAuditEvent("invite_email_mismatch", {
      invitationId: params.invitationId,
      invitedEmail: invitation.invitedEmail,
      currentEmail: user?.email?.trim().toLowerCase() ?? null,
      userId: params.userId,
    });
    throw new Error("Invitation email does not match the signed-in user.");
  }
  if (user.role !== "student") {
    logAuthAuditEvent("staff_invitation_blocked", {
      invitationId: params.invitationId,
      invitedEmail: invitation.invitedEmail,
      currentEmail: user.email.trim().toLowerCase(),
      currentRole: user.role,
      userId: params.userId,
    });
    throw new Error("Only student accounts may accept classroom invitations.");
  }

  const now = new Date();

  await getDb().transaction(async (tx) => {
    const [updatedInvitation] = await tx
      .update(classroomInvitations)
      .set({
        status: params.decision,
        acceptedByUserId: params.decision === "accepted" ? params.userId : null,
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(classroomInvitations.id, params.invitationId),
          eq(classroomInvitations.status, PENDING_INVITE_STATUS),
        ),
      )
      .returning({ id: classroomInvitations.id });

    if (!updatedInvitation) {
      const latestInvitation = await tx.query.classroomInvitations.findFirst({
        where: eq(classroomInvitations.id, params.invitationId),
      });

      const isIdempotentAccept =
        params.decision === "accepted" &&
        latestInvitation?.status === "accepted" &&
        latestInvitation.acceptedByUserId === params.userId;
      const isIdempotentReject =
        params.decision === "rejected" && latestInvitation?.status === "rejected";

      if (isIdempotentAccept || isIdempotentReject) {
        logAuthAuditEvent("invite_acceptance_replay", {
          invitationId: params.invitationId,
          userId: params.userId,
          decision: params.decision,
          currentStatus: latestInvitation?.status ?? null,
        });
        console.warn("[student-service] respondToInvitation: conflict resolved as replay", {
          invitationId: params.invitationId,
          userId: params.userId,
          decision: params.decision,
        });
        return;
      }

      throw new Error("Invitation not found or no longer pending.");
    }

    if (params.decision !== "accepted") {
      console.log("[student-service] respondToInvitation: invitation rejected", {
        invitationId: params.invitationId,
        userId: params.userId,
      });
      return;
    }

    const existingMembership = await tx.query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, invitation.classroomId),
        or(
          eq(classroomStudents.userId, params.userId),
          eq(classroomStudents.email, invitation.invitedEmail),
        ),
      ),
    });

    if (!existingMembership) {
      await tx.insert(classroomStudents).values({
        id: nanoid(),
        classroomId: invitation.classroomId,
        userId: params.userId,
        invitedByUserId: invitation.invitedByUserId,
        fullName: user.name ?? user.email,
        email: invitation.invitedEmail,
        inviteStatus: "accepted",
        onboardingStatus: "interest_profile_pending",
        createdAt: now,
        updatedAt: now,
      });
      console.log("[student-service] respondToInvitation: classroomStudents seat created", {
        invitationId: params.invitationId,
        userId: params.userId,
        classroomId: invitation.classroomId,
      });
      return;
    }

    if (existingMembership.userId && existingMembership.userId !== params.userId) {
      throw new Error("That invitation has already been claimed by another account.");
    }

    await tx
      .update(classroomStudents)
      .set({
        userId: params.userId,
        fullName: user.name ?? user.email,
        email: invitation.invitedEmail,
        inviteStatus: "accepted",
        updatedAt: now,
      })
      .where(eq(classroomStudents.id, existingMembership.id));
  });

  console.log("[student-service] respondToInvitation: DONE", {
    invitationId: params.invitationId,
    decision: params.decision,
  });

  void publishClassroomRealtimeEvent(invitation.classroomId, {
    type: "classroom_roster_updated",
    reason:
      params.decision === "accepted"
        ? "invitation_accepted"
        : "invitation_rejected",
    invitationId: params.invitationId,
    studentUserId: params.userId,
    email: invitation.invitedEmail,
  });
}

/**
 * Bulk invite students to a classroom.
 * Each student is invited sequentially. Failures are collected and returned.
 */
export async function bulkInviteStudents(params: {
  classroomId: string;
  invitedByUserId: string;
  students: Array<{ email: string }>;
}) {
  console.log("[student-service] bulkInviteStudents: START", {
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    studentCount: params.students.length,
    emails: params.students.map((s) => s.email),
  });

  const seenEmails = new Set<string>();
  const invited: StudentInviteResult[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const student of params.students) {
    const { normalizedEmail } = normalizeStudentInviteInput({
      email: student.email,
    });

    if (seenEmails.has(normalizedEmail)) {
      console.warn("[student-service] bulkInviteStudents: duplicate email in batch, skipping", {
        email: normalizedEmail,
      });
      failed.push({
        email: normalizedEmail,
        error: "Duplicate email in this import batch.",
      });
      continue;
    }

    seenEmails.add(normalizedEmail);

    try {
      console.log(`[student-service] bulkInviteStudents: inviting ${normalizedEmail}...`);
      const result = await inviteManagedStudentToClassroom({
        classroomId: params.classroomId,
        invitedByUserId: params.invitedByUserId,
        email: student.email,
      });
      console.log(`[student-service] bulkInviteStudents: ${normalizedEmail} → SUCCESS (invitationId=${result.id})`);
      invited.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to invite student.";
      console.error(`[student-service] bulkInviteStudents: ${normalizedEmail} → FAILED`, {
        email: normalizedEmail,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      failed.push({
        email: normalizedEmail,
        error: errorMessage,
      });
    }
  }

  console.log("[student-service] bulkInviteStudents: DONE", {
    classroomId: params.classroomId,
    invitedCount: invited.length,
    failedCount: failed.length,
    invited: invited.map((i) => i.email),
    failed,
  });

  return { invited, failed };
}

/**
 * Resend the invitation email to a student who already has a pending invitation.
 * Does NOT create a new invitation record — re-queues the email using the same
 * existing invitationId so the student's original sign-up link remains valid.
 * Also extends the invitation's expiry by another 7 days.
 */
export async function resendStudentInvitation(params: {
  invitationId: string;
  classroomId: string;
  requestedByUserId: string;
}) {
  console.log("[student-service] resendStudentInvitation: START", {
    invitationId: params.invitationId,
    classroomId: params.classroomId,
  });

  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.id, params.invitationId),
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
    with: { classroom: true },
  });

  if (!invitation) {
    throw new ValidationError("Invitation not found or is no longer pending.");
  }

  const classroom = invitation.classroom;
  if (!classroom) {
    throw new Error("Classroom not found for this invitation.");
  }

  // Extend the expiry window by another 7 days from now
  const INVITATION_TTL_DAYS = 7;
  const newExpiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await getDb()
    .update(classroomInvitations)
    .set({ expiresAt: newExpiresAt, updatedAt: new Date() })
    .where(eq(classroomInvitations.id, params.invitationId));

  console.log("[student-service] resendStudentInvitation: extended expiry, re-queuing email", {
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
    newExpiresAt,
  });

  try {
    const job = await EmailService.sendStudentInvitationEmail({
      email: invitation.invitedEmail,
      invitationId: params.invitationId,
      classroomName: classroom.title,
    });

    if (!job) {
      // BullMQ deduplicated — a job for this exact payload is already waiting.
      // That's fine; the student will receive the email once the existing job processes.
      console.warn("[student-service] resendStudentInvitation: email job was DEDUPLICATED (already in queue)", {
        invitationId: params.invitationId,
        email: invitation.invitedEmail,
      });
    } else {
      console.log("[student-service] resendStudentInvitation: email job enqueued", {
        invitationId: params.invitationId,
        email: invitation.invitedEmail,
        jobId: job.id,
      });
    }
  } catch (error) {
    console.error("[student-service] resendStudentInvitation: FAILED to enqueue email", {
      invitationId: params.invitationId,
      email: invitation.invitedEmail,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Failed to queue the invitation email. Please try again.");
  }

  void publishClassroomRealtimeEvent(params.classroomId, {
    type: "classroom_roster_updated",
    reason: "invitation_resent",
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
  });

  return {
    invitationId: params.invitationId,
    email: invitation.invitedEmail,
    newExpiresAt,
  };
}

/**
 * Cancel a pending invitation so the teacher can re-invite the same email address.
 * The student's original sign-up link will no longer work after cancellation.
 */
export async function cancelStudentInvitation(params: {
  invitationId: string;
  classroomId: string;
  requestedByUserId: string;
}) {
  console.log("[student-service] cancelStudentInvitation: START", {
    invitationId: params.invitationId,
    classroomId: params.classroomId,
  });

  const [updated] = await getDb()
    .update(classroomInvitations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(classroomInvitations.id, params.invitationId),
        eq(classroomInvitations.classroomId, params.classroomId),
        eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      ),
    )
    .returning({ id: classroomInvitations.id });

  if (!updated) {
    throw new ValidationError("Invitation not found or is no longer pending.");
  }

  console.log("[student-service] cancelStudentInvitation: DONE", { invitationId: params.invitationId });

  void publishClassroomRealtimeEvent(params.classroomId, {
    type: "classroom_roster_updated",
    reason: "invitation_cancelled",
    invitationId: params.invitationId,
  });

  return { invitationId: params.invitationId };
}

/**
 * List all pending non-expired invitations for a classroom (for the teacher's directory view).
 */
export async function listPendingClassroomInvitations(params: { classroomId: string }) {
  const now = new Date();
  return await getDb().query.classroomInvitations.findMany({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
      or(
        isNull(classroomInvitations.expiresAt),
        gt(classroomInvitations.expiresAt, now),
      ),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
}

