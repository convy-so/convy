import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  classroomStudents,
  learningTopics,
  studentInterestProfiles,
  studentModelAnalyses,
  studentModels,
  studentModelSnapshots,
  studentProgressReports,
} from "@/db/schema";
import type {
  StudentInterestProfile,
  StudentModelSnapshot,
  TeacherProgressReport,
} from "@/lib/learning/types";
import { studentModelSnapshotSchema } from "@/lib/learning/types";

export async function createStudentProgressReport(params: {
  topicId: string;
  classroomStudentId: string;
  generatedFromSessionId?: string | null;
  masteryPercent: number;
  sourceLocale?: string | null;
  report: TeacherProgressReport;
}) {
  const [report] = await getDb()
    .insert(studentProgressReports)
    .values({
      id: nanoid(),
      topicId: params.topicId,
      classroomStudentId: params.classroomStudentId,
      generatedFromSessionId: params.generatedFromSessionId ?? null,
      masteryPercent: params.masteryPercent,
      sourceLocale: params.sourceLocale ?? "en",
      report: params.report,
      visibility: "teacher_only",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return report;
}

export async function getLatestStudentProgressReport(params: {
  topicId: string;
  classroomStudentId: string;
}) {
  return await getDb().query.studentProgressReports.findFirst({
    where: and(
      eq(studentProgressReports.topicId, params.topicId),
      eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
    ),
    orderBy: [desc(studentProgressReports.createdAt)],
  });
}

export async function upsertInterestProfile(params: {
  classroomStudentId: string;
  profile: StudentInterestProfile;
}) {
  const existing = await getDb().query.studentInterestProfiles.findFirst({
    where: eq(studentInterestProfiles.classroomStudentId, params.classroomStudentId),
  });

  if (existing) {
    const [updated] = await getDb()
      .update(studentInterestProfiles)
      .set({
        profile: params.profile,
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(studentInterestProfiles.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await getDb()
    .insert(studentInterestProfiles)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      profile: params.profile,
      visibility: "private_to_student_and_agent",
      lastRefreshedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function markStudentOnboardingComplete(classroomStudentId: string) {
  const [updated] = await getDb()
    .update(classroomStudents)
    .set({
      onboardingStatus: "complete",
      updatedAt: new Date(),
    })
    .where(eq(classroomStudents.id, classroomStudentId))
    .returning();

  return updated;
}

export async function ensureStudentModel(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const existing = await getDb().query.studentModels.findFirst({
    where: eq(studentModels.classroomStudentId, params.classroomStudentId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await getDb()
    .insert(studentModels)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      summary: "",
      anomalyStatus: "clear",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function getStudentModelByClassroomStudentId(classroomStudentId: string) {
  return await getDb().query.studentModels.findFirst({
    where: eq(studentModels.classroomStudentId, classroomStudentId),
  });
}

export async function getLatestStudentModelSnapshot(studentModelId: string) {
  return await getDb().query.studentModelSnapshots.findFirst({
    where: eq(studentModelSnapshots.studentModelId, studentModelId),
    orderBy: [desc(studentModelSnapshots.version)],
  });
}

export async function createStudentModelSnapshot(params: {
  studentModelId: string;
  snapshot: StudentModelSnapshot;
  sourceType: string;
  sourceId?: string | null;
}) {
  const latest = await getLatestStudentModelSnapshot(params.studentModelId);
  const version = (latest?.version ?? 0) + 1;
  const normalizedSnapshot = studentModelSnapshotSchema.parse({
    ...params.snapshot,
    version,
  });

  const [snapshot] = await getDb()
    .insert(studentModelSnapshots)
    .values({
      id: nanoid(),
      studentModelId: params.studentModelId,
      version,
      snapshot: normalizedSnapshot,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(studentModels)
    .set({
      latestSnapshotId: snapshot.id,
      summary: normalizedSnapshot.summary,
      updatedAt: new Date(),
    })
    .where(eq(studentModels.id, params.studentModelId));

  return snapshot;
}

export async function createStudentModelAnalysis(params: {
  studentModelId: string;
  topicId?: string | null;
  sessionId?: string | null;
  sourceType: string;
  sourceId: string;
  status?: string;
  notes?: Record<string, unknown>;
}) {
  const [analysis] = await getDb()
    .insert(studentModelAnalyses)
    .values({
      id: nanoid(),
      studentModelId: params.studentModelId,
      topicId: params.topicId ?? null,
      sessionId: params.sessionId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: params.status ?? "completed",
      notes: params.notes ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return analysis;
}

export async function listStudentModelSummaries(params: {
  studentUserId: string;
}) {
  const models = await getDb().query.studentModels.findMany({
    where: eq(studentModels.studentUserId, params.studentUserId),
    with: {
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
      snapshots: {
        orderBy: [desc(studentModelSnapshots.version)],
        limit: 1,
      },
    },
  });

  return models.map((model) => ({
    ...model,
    latestSnapshot: model.snapshots[0] ?? null,
  }));
}

