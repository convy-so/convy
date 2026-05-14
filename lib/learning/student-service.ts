import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { classroomInvitations, classrooms, classroomStudents, users } from "@/db/schema";
import { EmailService } from "@/lib/email-service";
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
  reason: "self" | "staff_account" | "already_member";
};

export async function validateStudentsForInvitation(params: {
  classroomId: string;
  invitedByUserId: string;
  emails: string[];
}) {
  const inviter = await getDb().query.users.findFirst({
    where: eq(users.id, params.invitedByUserId),
  });

  const normalizedInviterEmail = inviter?.email.trim().toLowerCase();
  const normalizedEmails = params.emails.map((e) => e.trim().toLowerCase());

  // 1. Check for self-invites
  const invalid: InvitationValidationError[] = [];
  const valid: string[] = [];

  for (const email of normalizedEmails) {
    if (email === normalizedInviterEmail) {
      invalid.push({ email, reason: "self" });
      continue;
    }

    // 2. Check for staff accounts (Admin, Expert, Teacher)
    const existingUser = await getDb().query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser && existingUser.role !== "student") {
      invalid.push({ email, reason: "staff_account" });
      continue;
    }

    // 3. Check if already a member of THIS classroom
    const existingMembership = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, params.classroomId),
        eq(classroomStudents.email, email),
      ),
    });

    if (existingMembership) {
      invalid.push({ email, reason: "already_member" });
      continue;
    }

    valid.push(email);
  }

  return { valid, invalid };
}

/**
 * Invite a student email to a classroom.
 * This no longer provisions managed accounts. Invitations are accepted by self-registered users.
 */
export async function inviteManagedStudentToClassroom(params: {
  classroomId: string;
  invitedByUserId: string;
  email: string;
}) {
  const { normalizedEmail } = normalizeStudentInviteInput({
    email: params.email,
  });

  const validation = await validateStudentsForInvitation({
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    emails: [normalizedEmail],
  });

  if (validation.invalid.length > 0) {
    const error = validation.invalid[0];
    if (error.reason === "self") {
      throw new ValidationError("You cannot invite yourself to your own classroom.");
    }
    if (error.reason === "staff_account") {
      throw new ValidationError("This email is associated with a teacher or staff account and cannot be invited as a student.");
    }
    if (error.reason === "already_member") {
      throw new ValidationError("That student email is already attached to this classroom.");
    }
  }

  // 0. Fetch classroom details for the email
  const classroom = await getDb().query.classrooms.findFirst({
    where: eq(classrooms.id, params.classroomId),
  });

  if (!classroom) {
    throw new Error("Classroom not found.");
  }

  // Ensure no active pending invitation already exists.
  const pendingInvitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.invitedEmail, normalizedEmail),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
  });

  if (pendingInvitation) {
    throw new ValidationError("An active invitation already exists for this email.");
  }

  const studentId = nanoid();
  const now = new Date();

  // 3. Create invitation record (seat/membership is created on acceptance).
  await getDb().insert(classroomInvitations).values({
    id: studentId,
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    invitedEmail: normalizedEmail,
    status: PENDING_INVITE_STATUS,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Dispatch the activation email
  try {
    await EmailService.sendStudentActivationEmail({
      email: normalizedEmail,
      invitationId: studentId,
      classroomName: classroom.title,
    });
  } catch (error) {
    // We log the error but don't fail the whole action, 
    // as the record is already in the DB and can be resent later if needed.
    console.error("Failed to enqueue activation email:", error);
  }

  return {
    id: studentId,
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
    // Log error but don't break the whole dashboard for invitations
    console.error("Failed to list pending invitations:", error);
    return [];
  }
}

export async function respondToInvitation(params: {
  invitationId: string;
  userId: string;
  decision: "accepted" | "rejected";
}) {
  const invitation = await getDb().query.classroomInvitations.findFirst({
    where: eq(classroomInvitations.id, params.invitationId),
  });
  if (!invitation || invitation.status !== PENDING_INVITE_STATUS) {
    throw new Error("Invitation not found or no longer pending.");
  }

  const user = await getDb().query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!user || user.email.trim().toLowerCase() !== invitation.invitedEmail) {
    throw new Error("Invitation email does not match the signed-in user.");
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
      throw new Error("Invitation not found or no longer pending.");
    }

    if (params.decision !== "accepted") {
      return;
    }

    const existingMembership = await tx.query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, invitation.classroomId),
        eq(classroomStudents.userId, params.userId),
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
    }
  });
}

/**
 * Bulk invite students to a classroom
 */
export async function bulkInviteStudents(params: {
  classroomId: string;
  invitedByUserId: string;
  students: Array<{ email: string }>;
}) {
  const seenEmails = new Set<string>();
  const invited: StudentInviteResult[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const student of params.students) {
    const { normalizedEmail } = normalizeStudentInviteInput({
      email: student.email,
    });

    if (seenEmails.has(normalizedEmail)) {
      failed.push({
        email: normalizedEmail,
        error: "Duplicate email in this import batch.",
      });
      continue;
    }

    seenEmails.add(normalizedEmail);

    try {
      const result = await inviteManagedStudentToClassroom({
        classroomId: params.classroomId,
        invitedByUserId: params.invitedByUserId,
        email: student.email,
      });
      invited.push(result);
    } catch (error) {
      failed.push({
        email: normalizedEmail,
        error: error instanceof Error ? error.message : "Failed to invite student.",
      });
    }
  }

  return { invited, failed };
}
