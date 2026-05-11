"use server";

import { z } from "zod";

import * as StudentService from "@/lib/learning/student-service";
import { ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { ensureClassroomOwnerAccess, requireTeachingSession } from "./shared";

const inviteStudentSchema = z.object({
  classroomId: z.string().min(1),
  fullName: z.string().trim().min(2),
  email: z.string().email(),
});

const bulkInviteStudentsSchema = z.object({
  classroomId: z.string().min(1),
  students: z.array(z.object({ fullName: z.string().trim().min(2), email: z.string().email() })).min(1),
});

export async function inviteStudentToClassroomAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, inviteStudentSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await StudentService.inviteManagedStudentToClassroom({
      classroomId: body.classroomId,
      invitedByUserId: session.user.id,
      fullName: body.fullName,
      email: body.email,
    });
    return { success: true, data: result };
  }, "inviteStudentToClassroomAction");
}

export async function bulkInviteStudentsToClassroomAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, bulkInviteStudentsSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await StudentService.bulkInviteStudents({
      classroomId: body.classroomId,
      invitedByUserId: session.user.id,
      students: body.students,
    });
    return { success: true, data: result };
  }, "bulkInviteStudentsToClassroomAction");
}
