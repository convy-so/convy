import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentInterestProfiles,
  studentProgressReports,
} from "@/shared/db/schema";
import type {
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/features/tutoring/public-server";
import {
  LEARNING_DEFAULT_LOCALE,
  LEARNING_STATUS,
} from "@/shared/learning/constants";

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
      sourceLocale: params.sourceLocale ?? LEARNING_DEFAULT_LOCALE,
      report: params.report,
      visibility: LEARNING_STATUS.reportTeacherOnly,
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
      visibility: LEARNING_STATUS.studentInterestPrivateToStudentAndAgent,
      lastRefreshedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function upsertInterestProfileForUserMemberships(params: {
  userId: string;
  profile: StudentInterestProfile;
}) {
  const memberships = await getDb().query.classroomStudents.findMany({
    where: and(
      eq(classroomStudents.userId, params.userId),
      eq(classroomStudents.inviteStatus, LEARNING_STATUS.inviteAccepted),
    ),
    columns: {
      id: true,
    },
  });

  return await Promise.all(
    memberships.map((membership) =>
      upsertInterestProfile({
        classroomStudentId: membership.id,
        profile: params.profile,
      }),
    ),
  );
}

export async function markStudentOnboardingComplete(classroomStudentId: string) {
  const [updated] = await getDb()
    .update(classroomStudents)
    .set({
      onboardingStatus: LEARNING_STATUS.onboardingCompleted,
      updatedAt: new Date(),
    })
    .where(eq(classroomStudents.id, classroomStudentId))
    .returning();

  return updated;
}

export async function markStudentOnboardingCompleteForUser(userId: string) {
  const memberships = await getDb().query.classroomStudents.findMany({
    where: and(
      eq(classroomStudents.userId, userId),
      eq(classroomStudents.inviteStatus, LEARNING_STATUS.inviteAccepted),
    ),
    columns: {
      id: true,
    },
  });

  return await Promise.all(
    memberships.map((membership) => markStudentOnboardingComplete(membership.id)),
  );
}
