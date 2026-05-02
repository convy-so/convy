"use server";

import { z } from "zod";

import { getTeacherClassroomAccess } from "@/lib/learning/access";
import { getVerifiedSession } from "@/lib/auth/session";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";

import * as ClassroomService from "@/lib/learning/classroom-service";
import * as StudentService from "@/lib/learning/student-service";
import * as TopicService from "@/lib/learning/topic-service";
import * as InterventionService from "@/lib/learning/intervention-service";

import {
  withErrorHandling,
  ActionResult,
  validateInput,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/action-wrapper";

const appLocaleSchema = z.enum(["en", "fr", "de"]);

const createClassroomSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  gradeLabel: z.string().trim().min(1),
  defaultContentLocale: appLocaleSchema.optional(),
});

const inviteStudentSchema = z.object({
  classroomId: z.string().min(1),
  fullName: z.string().trim().min(2),
  email: z.string().email(),
});

const bulkInviteStudentsSchema = z.object({
  classroomId: z.string().min(1),
  students: z
    .array(
      z.object({
        fullName: z.string().trim().min(2),
        email: z.string().email(),
      }),
    )
    .min(1),
});

const createLearningTopicSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  subjectKey: z.string().trim().optional(),
  subjectLabel: z.string().trim().optional(),
  learningOutcomes: z.array(z.any()).min(1),
  sourceBoundary: z.any().optional(),
  contentLocale: appLocaleSchema.optional(),
});

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

/**
 * Helpers
 */

async function requireTeachingSession() {
  const session = await getVerifiedSession();
  if (!session) throw new UnauthorizedError();
  return { session };
}

async function ensureClassroomOwnerAccess(
  userId: string,
  classroomId: string,
) {
  const classroomAccess = await getTeacherClassroomAccess(userId, classroomId);

  if (!classroomAccess) {
    throw new NotFoundError("Classroom");
  }

  if (classroomAccess.accessLevel !== "owner") {
    throw new ForbiddenError("Only the classroom owner can perform this action.");
  }

  return classroomAccess;
}

/**
 * Classroom Actions
 */

export async function createClassroomAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createClassroomSchema);
    const { session } = await requireTeachingSession();
    
    const defaultContentLocale = await resolveUiLocaleForContentCreation({
      explicitLocale: body.defaultContentLocale ?? null,
      session,
    });

    const result = await ClassroomService.createClassroom({
      teacherUserId: session.user.id,
      title: body.title,
      description: body.description,
      subject: body.subject,
      gradeLabel: body.gradeLabel,
      defaultContentLocale,
    });

    return { success: true, data: result };
  }, "createClassroomAction");
}

export async function getTeacherClassroomsAction(): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const { session } = await requireTeachingSession();
    const data = await ClassroomService.getTeacherClassrooms(session.user.id);
    return { success: true, data };
  }, "getTeacherClassroomsAction");
}

export async function getClassroomAssignedSurveyProgressAction(
  classroomId: string,
): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const { session } = await requireTeachingSession();
    const data = await ClassroomService.getClassroomSurveyProgress({
      classroomId,
      teacherUserId: session.user.id,
    });
    return { success: true, data };
  }, "getClassroomAssignedSurveyProgressAction");
}

/**
 * Student Actions
 */

export async function inviteStudentToClassroomAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
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

export async function bulkInviteStudentsToClassroomAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
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

/**
 * Topic Actions
 */

export async function createLearningTopicAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createLearningTopicSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const contentLocale = await resolveUiLocaleForContentCreation({
      explicitLocale: body.contentLocale ?? null,
      session,
    });

    const result = await TopicService.createLearningTopic({
      classroomId: body.classroomId,
      createdByUserId: session.user.id,
      title: body.title,
      description: body.description,
      subject: body.subject,
      subjectKey: body.subjectKey,
      subjectLabel: body.subjectLabel,
      contentLocale,
      learningOutcomes: body.learningOutcomes,
      sourceBoundary: body.sourceBoundary,
    });

    return {
      success: true,
      data: {
        id: result.id,
        classroomId: result.classroomId,
        title: result.title,
        learningOutcomeCount: result.learningOutcomes.length,
        contentLocale: result.contentLocale,
      },
    };
  }, "createLearningTopicAction");
}

/**
 * Intervention Actions
 */

export async function getLearningInterventionsAction(input: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, input.classroomId);

    const data = await InterventionService.listInterventions(input);
    return { success: true, data };
  }, "getLearningInterventionsAction");
}

export async function createLearningInterventionAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, learningInterventionSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const result = await InterventionService.createIntervention({
      ...body,
      createdByUserId: session.user.id,
    });
    return { success: true, data: result };
  }, "createLearningInterventionAction");
}

export async function updateLearningInterventionAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, learningInterventionUpdateSchema);
    await requireTeachingSession();

    const result = await InterventionService.updateIntervention(body);
    return { success: true, data: result };
  }, "updateLearningInterventionAction");
}
