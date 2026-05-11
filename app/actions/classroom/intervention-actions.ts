"use server";

import { z } from "zod";

import * as InterventionService from "@/lib/learning/intervention-service";
import { ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { ensureClassroomOwnerAccess, requireTeachingSession } from "./shared";

const learningInterventionSchema = z.object({
  classroomId: z.string().min(1),
  classroomStudentId: z.string().min(1),
  topicId: z.string().min(1).optional(),
  interventionType: z.enum(["reteach", "check_in", "practice", "family_follow_up"]),
  priority: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(3),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

const learningInterventionUpdateSchema = z.object({
  interventionId: z.string().min(1),
  status: z.enum(["planned", "in_progress", "completed", "dismissed"]),
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

export async function getLearningInterventionsAction(input: { classroomId: string; topicId?: string; classroomStudentId?: string; }): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, input.classroomId);
    const data = await InterventionService.listInterventions(input);
    return { success: true, data };
  }, "getLearningInterventionsAction");
}

export async function createLearningInterventionAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, learningInterventionSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await InterventionService.createIntervention({ ...body, createdByUserId: session.user.id });
    return { success: true, data: result };
  }, "createLearningInterventionAction");
}

export async function updateLearningInterventionAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, learningInterventionUpdateSchema);
    await requireTeachingSession();

    const result = await InterventionService.updateIntervention(body);
    return { success: true, data: result };
  }, "updateLearningInterventionAction");
}
