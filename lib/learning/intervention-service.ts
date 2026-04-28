import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningInterventions } from "@/db/schema";

export type InterventionRecord = {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  topicId: string | null;
  interventionType: "reteach" | "check_in" | "practice" | "family_follow_up";
  priority: "low" | "medium" | "high";
  status: "planned" | "in_progress" | "completed" | "dismissed";
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

/**
 * List interventions for a classroom, optionally filtered by topic or student
 */
export async function listInterventions(params: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}): Promise<InterventionRecord[]> {
  const records = await getDb().query.learningInterventions.findMany({
    where: (table, operators) => {
      const conditions = [operators.eq(table.classroomId, params.classroomId)];

      if (params.topicId) {
        conditions.push(operators.eq(table.topicId, params.topicId));
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

  return records.map(formatLearningIntervention);
}

/**
 * Create a new learning intervention
 */
export async function createIntervention(params: {
  classroomId: string;
  classroomStudentId: string;
  createdByUserId: string;
  topicId?: string;
  interventionType: "reteach" | "check_in" | "practice" | "family_follow_up";
  priority: "low" | "medium" | "high";
  title: string;
  notes?: string;
  dueAt?: string;
}) {
  const id = nanoid();
  const now = new Date();

  const [record] = await getDb()
    .insert(learningInterventions)
    .values({
      id,
      classroomId: params.classroomId,
      classroomStudentId: params.classroomStudentId,
      createdByUserId: params.createdByUserId,
      topicId: params.topicId || null,
      interventionType: params.interventionType,
      priority: params.priority,
      status: "planned",
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
  status: "planned" | "in_progress" | "completed" | "dismissed";
  notes?: string;
  dueAt?: string;
}) {
  const now = new Date();
  const completedAt = params.status === "completed" ? now : undefined;

  const [record] = await getDb()
    .update(learningInterventions)
    .set({
      status: params.status,
      notes: params.notes !== undefined ? params.notes : undefined,
      dueAt: params.dueAt ? new Date(params.dueAt) : undefined,
      completedAt,
      updatedAt: now,
    })
    .where(eq(learningInterventions.id, params.interventionId))
    .returning();

  return record;
}

/**
 * Format database record to service record
 */
function formatLearningIntervention(record: {
  id: string;
  classroomId: string;
  classroomStudentId: string;
  topicId: string | null;
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
    topicId: record.topicId,
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
