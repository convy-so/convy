
"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/shared/db";
import { classroomStudents, lessons } from "@/shared/db/schema";
import * as InterventionService from "@/features/tutoring/server/intervention-service";
import {
  ActionResult,
  ActionError,
  NotFoundError,
  validateInput,
  withErrorHandling,
} from "@/shared/http/action-result";
import {
  TUTORING_INTERVENTION_STATUS_VALUES,
  TUTORING_INTERVENTION_TYPE_VALUES,
  TUTORING_PRIORITY_VALUES,
} from "@/shared/tutoring/constants";

import { ensureClassroomOwnerAccess, requireTeachingSession, revalidateTutoringUi } from "./action-access";

const interventionSchema = z.object({
  classroomId: z.string().min(1),
  classroomStudentId: z.string().min(1),
  lessonId: z.string().min(1).optional(),
  interventionType: z.enum(TUTORING_INTERVENTION_TYPE_VALUES),
  priority: z.enum(TUTORING_PRIORITY_VALUES),
  title: z.string().trim().min(3),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

const interventionUpdateSchema = z.object({
  interventionId: z.string().min(1),
  status: z.enum(TUTORING_INTERVENTION_STATUS_VALUES),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

export async function createInterventionAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, interventionSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const classroomStudent = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.id, body.classroomStudentId),
        eq(classroomStudents.classroomId, body.classroomId),
      ),
    });

    if (!classroomStudent) {
      throw new NotFoundError("Student");
    }

    if (body.lessonId) {
      const lesson = await getDb().query.lessons.findFirst({
        where: and(
          eq(lessons.id, body.lessonId),
          eq(lessons.classroomId, body.classroomId),
        ),
      });

      if (!lesson) {
        throw new ActionError(
          "Lesson does not belong to the selected classroom",
          "VALIDATION_ERROR",
        );
      }
    }

    const result = await InterventionService.createIntervention({ ...body, createdByUserId: session.user.id });
    revalidateTutoringUi();
    return { success: true, data: result };
  }, "createInterventionAction");
}

export async function updateInterventionAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, interventionUpdateSchema);
    const { session } = await requireTeachingSession();
    const intervention = await InterventionService.getInterventionById(body.interventionId);

    if (!intervention) {
      throw new NotFoundError("Intervention");
    }

    await ensureClassroomOwnerAccess(session.user.id, intervention.classroomId);

    const result = await InterventionService.updateIntervention({
      ...body,
      classroomId: intervention.classroomId,
    });

    if (!result) {
      throw new NotFoundError("Intervention");
    }

    revalidateTutoringUi();
    return { success: true, data: result };
  }, "updateInterventionAction");
}


