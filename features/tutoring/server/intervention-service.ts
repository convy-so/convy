import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { lessonInterventions } from "@/shared/db/schema";
import {
  TUTORING_INTERVENTION_STATUS_VALUES,
  TUTORING_INTERVENTION_TYPE_VALUES,
  TUTORING_PRIORITY_VALUES,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";

export type InterventionRecord = {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  lessonId: string | null;
  interventionType: (typeof TUTORING_INTERVENTION_TYPE_VALUES)[number];
  priority: (typeof TUTORING_PRIORITY_VALUES)[number];
  status: (typeof TUTORING_INTERVENTION_STATUS_VALUES)[number];
  title: string;
  notes: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    fullName: string;
    email: string;
  };
};

export async function getInterventionById(interventionId: string) {
  return await getDb().query.lessonInterventions.findFirst({
    where: eq(lessonInterventions.id, interventionId),
  });
}

/**
 * List interventions for a classroom, optionally filtered by lesson or student
 */
export async function listInterventions(params: {
  classroomId: string;
  lessonId?: string;
  classroomStudentId?: string;
}): Promise<InterventionRecord[]> {
  const records = await getDb().query.lessonInterventions.findMany({
    where: (table, operators) => {
      const conditions = [operators.eq(table.classroomId, params.classroomId)];

      if (params.lessonId) {
        conditions.push(operators.eq(table.lessonId, params.lessonId));
      }

      if (params.classroomStudentId) {
        conditions.push(
          operators.eq(table.classroomStudentId, params.classroomStudentId),
        );
      }

      return operators.and(...conditions);
    },
    with: {
      classroomStudent: true,
    },
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });

  return records.map(formatLessonIntervention);
}

/**
 * Create a new learning intervention
 */
export async function createIntervention(params: {
  classroomId: string;
  classroomStudentId: string;
  createdByUserId: string;
  lessonId?: string;
  interventionType: (typeof TUTORING_INTERVENTION_TYPE_VALUES)[number];
  priority: (typeof TUTORING_PRIORITY_VALUES)[number];
  title: string;
  notes?: string;
  dueAt?: string;
}) {
  const id = nanoid();
  const now = new Date();

  const [record] = await getDb()
    .insert(lessonInterventions)
    .values({
      id,
      classroomId: params.classroomId,
      classroomStudentId: params.classroomStudentId,
      createdByUserId: params.createdByUserId,
      lessonId: params.lessonId || null,
      interventionType: params.interventionType,
      priority: params.priority,
      status: TUTORING_STATUS.interventionPlanned,
      title: params.title,
      notes: params.notes || null,
      dueAt: params.dueAt ? new Date(params.dueAt) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return record;
}

/**
 * Update an existing intervention status or notes
 */
export async function updateIntervention(params: {
  interventionId: string;
  classroomId: string;
  status: (typeof TUTORING_INTERVENTION_STATUS_VALUES)[number];
  notes?: string;
  dueAt?: string;
}) {
  const now = new Date();
  const completedAt =
    params.status === TUTORING_STATUS.interventionCompleted ? now : undefined;

  const [record] = await getDb()
    .update(lessonInterventions)
    .set({
      status: params.status,
      notes: params.notes !== undefined ? params.notes : undefined,
      dueAt: params.dueAt ? new Date(params.dueAt) : undefined,
      completedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(lessonInterventions.id, params.interventionId),
        eq(lessonInterventions.classroomId, params.classroomId),
      ),
    )
    .returning();

  return record;
}

/**
 * Format database record to service record
 */
function formatLessonIntervention(record: {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  lessonId: string | null;
  interventionType: string;
  priority: string;
  status: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  classroomStudent: {
    id: string;
    fullName: string;
    email: string;
  };
}): InterventionRecord {
  return {
    id: record.id,
    classroomId: record.classroomId,
    classroomStudentId: record.classroomStudentId,
    lessonId: record.lessonId,
    interventionType: record.interventionType as InterventionRecord["interventionType"],
    priority: record.priority as InterventionRecord["priority"],
    status: record.status as InterventionRecord["status"],
    title: record.title,
    notes: record.notes,
    dueAt: record.dueAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    student: {
      id: record.classroomStudent.id,
      fullName: record.classroomStudent.fullName,
      email: record.classroomStudent.email,
    },
  };
}


