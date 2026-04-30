import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { classroomStudents, users } from "@/db/schema";
import { provisionManagedStudentAccount } from "@/lib/learning/provisioning";

export type StudentInviteResult = {
  id: string;
  classroomId: string;
  fullName: string;
  email: string;
  inviteStatus: string;
};

const PENDING_INVITE_STATUS = "pending";
const INVITED_INVITE_STATUS = "invited";

function normalizeStudentInviteInput(input: { fullName: string; email: string }) {
  return {
    normalizedEmail: input.email.trim().toLowerCase(),
    normalizedFullName: input.fullName.trim(),
  };
}

/**
 * Invite a managed student to a classroom
 * This creates a student record and provisions a managed account
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

  // 2. Check if email already belongs to a non-managed user
  const existingUser = await getDb().query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalizedEmail}`,
  });

  if (existingUser) {
    const existingManagedSeat = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.userId, existingUser.id),
        eq(classroomStudents.email, normalizedEmail),
      ),
    });

    if (!existingManagedSeat) {
      throw new Error(
        "That email already belongs to an existing account and cannot be auto-managed as a student.",
      );
    }
  }

  const studentId = nanoid();
  const now = new Date();

  // 3. Insert student record
  await getDb().insert(classroomStudents).values({
    id: studentId,
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    fullName: normalizedFullName,
    email: normalizedEmail,
    inviteStatus: PENDING_INVITE_STATUS,
    onboardingStatus: "interest_profile_pending",
    createdAt: now,
    updatedAt: now,
  });

  // 4. Provision account
  const provisioned = await provisionManagedStudentAccount({
    classroomStudentId: studentId,
  });

  return {
    id: studentId,
    classroomId: params.classroomId,
    fullName: normalizedFullName,
    email: provisioned.email,
    inviteStatus: INVITED_INVITE_STATUS,
  };
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
