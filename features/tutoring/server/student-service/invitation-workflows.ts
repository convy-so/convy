import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { EmailService } from "@/shared/email/email-service";
import { publishClassroomRealtimeEvent } from "@/shared/infra/realtime";
import { ValidationError } from "@/shared/http/action-result";
import { getDb } from "@/shared/db";
import { classroomInvitations, classrooms } from "@/shared/db/schema";

import {
  normalizeStudentInviteInput,
  PENDING_INVITE_STATUS,
  type StudentInviteResult,
} from "./invitation-model";
import { validateStudentsForInvitation } from "./validation";
import { requireValue } from "@/shared/utils/collections";

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
    const error = requireValue(
      validation.invalid[0],
      "Expected an invalid invitation entry when validation failed",
    );
    console.warn("[student-service] inviteManagedStudentToClassroom: validation blocked", {
      email: normalizedEmail,
      reason: error.reason,
    });
    if (error.reason === "self") {
      throw new ValidationError("You cannot invite yourself to your own classroom.");
    }
    if (error.reason === "staff_account") {
      throw new ValidationError(
        "This email is associated with a teacher or staff account and cannot be invited as a student.",
      );
    }
    if (error.reason === "already_member") {
      throw new ValidationError("That student email is already attached to this classroom.");
    }
    if (error.reason === "already_invited") {
      throw new ValidationError("An active invitation already exists for this email.");
    }
  }

  const classroom = await getDb().query.classrooms.findFirst({
    where: eq(classrooms.id, params.classroomId),
  });

  if (!classroom) {
    console.error("[student-service] inviteManagedStudentToClassroom: classroom not found", {
      classroomId: params.classroomId,
    });
    throw new Error("Classroom not found.");
  }

  const existingInvitation = await getDb().query.classroomInvitations.findFirst({
    where: and(
      eq(classroomInvitations.classroomId, params.classroomId),
      eq(classroomInvitations.invitedEmail, normalizedEmail),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ),
  });

  let invitationId = nanoid();
  const now = new Date();
  const invitationTtlDays = 7;
  const expiresAt = new Date(
    now.getTime() + invitationTtlDays * 24 * 60 * 60 * 1000,
  );

  if (existingInvitation) {
    invitationId = existingInvitation.id;
    console.log(
      "[student-service] inviteManagedStudentToClassroom: updating existing expired invitation",
      {
        invitationId,
        email: normalizedEmail,
      },
    );

    await getDb()
      .update(classroomInvitations)
      .set({
        invitedByUserId: params.invitedByUserId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .where(eq(classroomInvitations.id, invitationId));
  } else {
    console.log(
      "[student-service] inviteManagedStudentToClassroom: creating new invitation record",
      {
        invitationId,
        classroomId: params.classroomId,
        email: normalizedEmail,
      },
    );

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

  try {
    const job = await EmailService.sendStudentInvitationEmail({
      email: normalizedEmail,
      invitationId,
      classroomName: classroom.title,
    });

    if (!job) {
      console.warn(
        "[student-service] inviteManagedStudentToClassroom: email job was deduplicated by BullMQ",
        {
          invitationId,
          email: normalizedEmail,
          classroomId: params.classroomId,
        },
      );
    } else {
      console.log(
        "[student-service] inviteManagedStudentToClassroom: email job enqueued successfully",
        {
          invitationId,
          email: normalizedEmail,
          jobId: job.id,
        },
      );
    }
  } catch (error) {
    console.error(
      "[student-service] inviteManagedStudentToClassroom: failed to enqueue invitation email",
      {
        invitationId,
        email: normalizedEmail,
        classroomId: params.classroomId,
        classroomName: classroom.title,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
  }

  console.log("[student-service] inviteManagedStudentToClassroom: DONE", {
    invitationId,
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

export async function bulkInviteStudents(params: {
  classroomId: string;
  invitedByUserId: string;
  students: Array<{ email: string }>;
}) {
  console.log("[student-service] bulkInviteStudents: START", {
    classroomId: params.classroomId,
    invitedByUserId: params.invitedByUserId,
    studentCount: params.students.length,
    emails: params.students.map((student) => student.email),
  });

  const seenEmails = new Set<string>();
  const invited: StudentInviteResult[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const student of params.students) {
    const { normalizedEmail } = normalizeStudentInviteInput({
      email: student.email,
    });

    if (seenEmails.has(normalizedEmail)) {
      console.warn(
        "[student-service] bulkInviteStudents: duplicate email in batch, skipping",
        {
          email: normalizedEmail,
        },
      );
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
      console.log(
        `[student-service] bulkInviteStudents: ${normalizedEmail} success (invitationId=${result.id})`,
      );
      invited.push(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to invite student.";
      console.error(`[student-service] bulkInviteStudents: ${normalizedEmail} failed`, {
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
    invited: invited.map((invite) => invite.email),
    failed,
  });

  return { invited, failed };
}
