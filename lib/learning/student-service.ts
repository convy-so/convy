import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { classroomInvitations, classroomStudents, users } from "@/db/schema";

export type StudentInviteResult = {
  id: string;
  classroomId: string;
  fullName: string;
  email: string;
  inviteStatus: string;
};

const PENDING_INVITE_STATUS = "pending";

function normalizeStudentInviteInput(input: { fullName: string; email: string }) {
  return {
    normalizedEmail: input.email.trim().toLowerCase(),
    normalizedFullName: input.fullName.trim(),
  };
}

/**
 * Invite a student email to a classroom.
 * This no longer provisions managed accounts. Invitations are accepted by self-registered users.
 */
export async function inviteManagedStudentToClassroom(params: {
  classroomId: string;
  invitedByUserId: string;
  fullName: string;
  email: string;
}) {
  const { normalizedEmail, normalizedFullName } = normalizeStudentInviteInput({
    fullName: params.fullName,
    email: params.email,
  });

  // 1. Check if student already exists in this classroom
  const existingStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, params.classroomId),
      eq(classroomStudents.email, normalizedEmail),
    ),
  });

  if (existingStudent) {
    throw new Error("That student email is already attached to this classroom.");
  }

  // 2. Ensure no active pending invitation already exists.
  const pendingInvitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.invitedEmail, normalizedEmail),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
  });

  if (pendingInvitation) {
    throw new Error("An active invitation already exists for this email.");
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

  return {
    id: studentId,
    classroomId: params.classroomId,
    fullName: normalizedFullName,
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

  await getDb()
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
    );

  if (params.decision === "accepted") {
    const existingMembership = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.classroomId, invitation.classroomId),
        eq(classroomStudents.userId, params.userId),
      ),
    });

    if (!existingMembership) {
      await getDb().insert(classroomStudents).values({
        id: nanoid(),
        classroomId: invitation.classroomId,
        userId: params.userId,
        invitedByUserId: invitation.invitedByUserId,
        fullName: user.name,
        email: invitation.invitedEmail,
        inviteStatus: "accepted",
        onboardingStatus: "interest_profile_pending",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Bulk invite students to a classroom
 */
export async function bulkInviteStudents(params: {
  classroomId: string;
  invitedByUserId: string;
  students: Array<{ fullName: string; email: string }>;
}) {
  const seenEmails = new Set<string>();
  const invited: StudentInviteResult[] = [];
  const failed: Array<{ fullName: string; email: string; error: string }> = [];

  for (const student of params.students) {
    const { normalizedEmail } = normalizeStudentInviteInput({
      fullName: student.fullName,
      email: student.email,
    });

    if (seenEmails.has(normalizedEmail)) {
      failed.push({
        fullName: student.fullName,
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
        fullName: student.fullName,
        email: student.email,
      });
      invited.push(result);
    } catch (error) {
      failed.push({
        fullName: student.fullName,
        email: normalizedEmail,
        error: error instanceof Error ? error.message : "Failed to invite student.",
      });
    }
  }

  return { invited, failed };
}
