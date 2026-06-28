import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentInterestProfiles,
  studentLessonReports,
} from "@/shared/db/schema";
import type {
  StudentInterestProfile,
} from "@/features/tutoring/server/lesson-foundation-schemas";
import type {
  TeacherProgressReport,
} from "@/features/tutoring/server/student-session-schemas";
import {
  TUTORING_DEFAULT_LOCALE,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";

export async function createStudentProgressReport(params: {
  lessonId: string;
  classroomStudentId: string;
  generatedFromSessionId?: string | null;
  masteryPercent: number;
  sourceLocale?: string | null;
  report: TeacherProgressReport;
}) {
  const [report] = await getDb()
    .insert(studentLessonReports)
    .values({
      id: nanoid(),
      lessonId: params.lessonId,
      classroomStudentId: params.classroomStudentId,
      generatedFromSessionId: params.generatedFromSessionId ?? null,
      masteryPercent: params.masteryPercent,
      sourceLocale: params.sourceLocale ?? TUTORING_DEFAULT_LOCALE,
      report: params.report,
      visibility: TUTORING_STATUS.reportTeacherOnly,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return report;
}

export async function getLatestStudentProgressReport(params: {
  lessonId: string;
  classroomStudentId: string;
}) {
  return await getDb().query.studentLessonReports.findFirst({
    where: and(
      eq(studentLessonReports.lessonId, params.lessonId),
      eq(studentLessonReports.classroomStudentId, params.classroomStudentId),
    ),
    orderBy: [desc(studentLessonReports.createdAt)],
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
      visibility: TUTORING_STATUS.studentInterestPrivateToStudentAndAgent,
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
      eq(classroomStudents.inviteStatus, TUTORING_STATUS.inviteAccepted),
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
      onboardingStatus: TUTORING_STATUS.onboardingCompleted,
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
      eq(classroomStudents.inviteStatus, TUTORING_STATUS.inviteAccepted),
    ),
    columns: {
      id: true,
    },
  });

  return await Promise.all(
    memberships.map((membership) => markStudentOnboardingComplete(membership.id)),
  );
}


