"use server";

import { z } from "zod";

import * as StudentService from "@/lib/learning/student-service";
import { ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { ensureClassroomOwnerAccess, requireTeachingSession, revalidateLearningUi } from "./shared";

const inviteStudentSchema = z.object({
  classroomId: z.string().min(1),
  email: z.string().email(),
});

const bulkInviteStudentsSchema = z.object({
  classroomId: z.string().min(1),
  students: z.array(z.object({ email: z.string().email() })).min(1),
});

const respondToInvitationSchema = z.object({
  invitationId: z.string().min(1),
  decision: z.enum(["accepted", "rejected"]),
});

export async function inviteStudentToClassroomAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, inviteStudentSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await StudentService.inviteManagedStudentToClassroom({
      classroomId: body.classroomId,
      invitedByUserId: session.user.id,
      email: body.email,
    });
    revalidateLearningUi();
    return { success: true, data: result };
  }, "inviteStudentToClassroomAction");
}

export async function bulkInviteStudentsToClassroomAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, bulkInviteStudentsSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    // 1. Perform pre-validation to detect staff accounts, self-invites, or existing members
    const validation = await StudentService.validateStudentsForInvitation({
      classroomId: body.classroomId,
      invitedByUserId: session.user.id,
      emails: body.students.map((s) => s.email),
    });

    if (validation.invalid.length > 0) {
      return { 
        success: false, 
        error: {
          code: "VALIDATION_FAILED", 
          data: validation
        }
      };
    }

    const result = await StudentService.bulkInviteStudents({
      classroomId: body.classroomId,
      invitedByUserId: session.user.id,
      students: body.students,
    });
    revalidateLearningUi();
    return { success: true, data: result };
  }, "bulkInviteStudentsToClassroomAction");
}

export async function respondToInvitationAction(input: unknown): Promise<ActionResult<{ success: boolean }>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, respondToInvitationSchema);
    const { session } = await requireTeachingSession();

    await StudentService.respondToInvitation({
      invitationId: body.invitationId,
      userId: session.user.id,
      decision: body.decision,
    });

    revalidateLearningUi();
    return { success: true, data: { success: true } };
  }, "respondToInvitationAction");
}

const resendInvitationSchema = z.object({
  invitationId: z.string().min(1),
  classroomId: z.string().min(1),
});

export async function resendStudentInvitationAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, resendInvitationSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await StudentService.resendStudentInvitation({
      invitationId: body.invitationId,
      classroomId: body.classroomId,
      requestedByUserId: session.user.id,
    });
    revalidateLearningUi();
    return { success: true, data: { email: result.email } };
  }, "resendStudentInvitationAction");
}

const cancelInvitationSchema = z.object({
  invitationId: z.string().min(1),
  classroomId: z.string().min(1),
});

export async function cancelStudentInvitationAction(input: unknown): Promise<ActionResult<{ success: boolean }>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, cancelInvitationSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    await StudentService.cancelStudentInvitation({
      invitationId: body.invitationId,
      classroomId: body.classroomId,
      requestedByUserId: session.user.id,
    });

    revalidateLearningUi();
    return { success: true, data: { success: true } };
  }, "cancelStudentInvitationAction");
}

