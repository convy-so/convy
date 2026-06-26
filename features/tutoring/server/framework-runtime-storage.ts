import { and, asc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { unstable_cache } from "next/cache";

import { getDb } from "@/shared/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  lessons,
} from "@/shared/db/schema";
import { getCourseById } from "@/features/tutoring/server/course-service";
import { createEmptyExpertFramework } from "@/features/tutoring/server/framework-presets";
import {
  getFrameworkRecord,
  listFrameworkRecords,
  type FrameworkRecord,
} from "@/features/tutoring/server/framework-records";
import {
  activeExpertFrameworkSchema,
  expertFrameworkSchema,
  isLegacyExpertFrameworkCapabilityGuidance,
  type ActiveExpertFramework,
  type ExpertFramework,
} from "@/features/tutoring/public-server";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";
import { requireValue } from "@/shared/utils/collections";

export async function getCourseFrameworks(courseId: string, includeArchived = false) {
  return await listFrameworkRecords({ courseId, includeArchived });
}

export async function getFrameworkById(frameworkId: string) {
  return await getFrameworkRecord(frameworkId);
}

export async function getActiveFrameworkForCourse(courseId: string) {
  const active = (await getCourseFrameworks(courseId, true)).find(
    (candidate) => candidate.status === TUTORING_STATUS.frameworkActive,
  );

  return active ?? null;
}

export async function createExpertFrameworkForCourse(params: {
  courseId: string;
  name: string;
  description?: string;
}) {
  const course = await getCourseById(params.courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  const artifact = createEmptyExpertFramework({
    name: params.name,
    description: params.description ?? "",
  });

  const [framework] = await getDb()
    .insert(expertFrameworks)
    .values({
      id: nanoid(),
      courseId: course.id,
      name: params.name,
      description: params.description ?? null,
      status: TUTORING_STATUS.frameworkDraft,
      seedSource: TUTORING_STATUS.frameworkSeedExpertAuthored,
      draftFramework: artifact,
      liveFramework: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return requireValue(framework, "Failed to create expert framework.");
}

export async function updateFrameworkDraft(params: {
  frameworkId: string;
  draftFramework: ExpertFramework;
}) {
  const framework = await getFrameworkById(params.frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === TUTORING_STATUS.frameworkArchived) {
    throw new Error("ARCHIVED_FRAMEWORK_READ_ONLY");
  }

  const draftFramework = expertFrameworkSchema.parse(params.draftFramework);
  const [updated] = await getDb()
    .update(expertFrameworks)
    .set({
      name: draftFramework.name,
      description: draftFramework.description || null,
      draftFramework,
      updatedAt: new Date(),
    })
    .where(eq(expertFrameworks.id, params.frameworkId))
    .returning();

  return requireValue(updated, "Failed to update framework draft.");
}

export async function activateFramework(params: {
  frameworkId: string;
  activatedByUserId: string;
}) {
  const framework = await getFrameworkById(params.frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === TUTORING_STATUS.frameworkArchived) {
    throw new Error("ARCHIVED_FRAMEWORK_READ_ONLY");
  }

  const artifact = expertFrameworkSchema.parse(framework.draftFramework);

  return await getDb().transaction(async (tx) => {
    await tx
      .update(expertFrameworks)
      .set({
        status: TUTORING_STATUS.frameworkInactive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expertFrameworks.courseId, framework.courseId),
          eq(expertFrameworks.status, TUTORING_STATUS.frameworkActive),
        ),
      );

    const [updated] = await tx
      .update(expertFrameworks)
      .set({
        name: artifact.name,
        description: artifact.description || null,
        status: TUTORING_STATUS.frameworkActive,
        liveFramework: artifact,
        activatedAt: new Date(),
        activatedByUserId: params.activatedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id))
      .returning();

    return requireValue(updated, "Failed to activate framework.");
  });
}

export async function archiveFramework(frameworkId: string) {
  const framework = await getFrameworkById(frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === TUTORING_STATUS.frameworkActive) {
    throw new Error("ACTIVE_FRAMEWORK_CANNOT_BE_ARCHIVED");
  }

  const [updated] = await getDb()
    .update(expertFrameworks)
    .set({
      status: TUTORING_STATUS.frameworkArchived,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expertFrameworks.id, frameworkId))
    .returning();

  return requireValue(updated, "Failed to archive framework.");
}

export async function deleteDraftFramework(frameworkId: string) {
  const framework = await getFrameworkById(frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (
    framework.status !== TUTORING_STATUS.frameworkDraft ||
    framework.activatedAt
  ) {
    throw new Error("ONLY_NEVER_ACTIVATED_DRAFTS_CAN_BE_DELETED");
  }

  await getDb().delete(expertFrameworks).where(eq(expertFrameworks.id, frameworkId));
}

export async function listApprovedCrystallizations(params: {
  courseId: string;
  frameworkId?: string;
}) {
  return await getDb().query.expertCrystallizations.findMany({
    where: and(
      eq(expertCrystallizations.courseId, params.courseId),
      eq(expertCrystallizations.status, TUTORING_STATUS.crystallizationApproved),
      or(
        eq(expertCrystallizations.relevanceScope, TUTORING_STATUS.relevanceGeneral),
        and(
          eq(
            expertCrystallizations.relevanceScope,
            TUTORING_STATUS.relevanceFrameworkSpecific,
          ),
          eq(expertCrystallizations.frameworkId, params.frameworkId ?? ""),
        ),
      ),
    ),
    orderBy: [asc(expertCrystallizations.createdAt)],
  });
}

export async function listOpenConflicts(params: { lessonId: string }) {
  return await getDb().query.expertConflicts.findMany({
    where: and(
      eq(expertConflicts.lessonId, params.lessonId),
      eq(expertConflicts.status, TUTORING_STATUS.conflictOpen),
    ),
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
  });
}

export async function getActiveFrameworkBundleForLesson(
  lessonId: string,
): Promise<ActiveExpertFramework> {
  const lesson = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });
  if (!lesson) {
    throw new Error("Lesson not found.");
  }

  const framework = await getActiveFrameworkForCourse(lesson.courseId);
  if (!framework) {
    throw new Error(
      "No active expert framework exists for this course. Activate a framework before tutoring starts.",
    );
  }
  if (!framework.liveFramework) {
    throw new Error(
      "The active framework is missing its live snapshot. Reactivate the framework before tutoring starts.",
    );
  }
  const parsedLiveFramework = expertFrameworkSchema.safeParse(
    framework.liveFramework,
  );
  if (!parsedLiveFramework.success) {
    const rawCapabilityGuidance =
      typeof framework.liveFramework === "object" && framework.liveFramework !== null
        ? (framework.liveFramework as Record<string, unknown>).capabilityGuidance
        : undefined;
    if (isLegacyExpertFrameworkCapabilityGuidance(rawCapabilityGuidance)) {
      throw new Error(
        "The active expert framework still uses the retired capability format. An expert must re-author its capability settings and reactivate it before tutoring can continue.",
      );
    }

    throw new Error(
      parsedLiveFramework.error.errors[0]?.message ??
        "The active expert framework is invalid. An expert must reactivate a valid framework before tutoring can continue.",
    );
  }

  const [approvedCrystallizations, openConflicts] = await Promise.all([
    listApprovedCrystallizations({
      courseId: framework.courseId,
      frameworkId: framework.id,
    }),
    listOpenConflicts({ lessonId }),
  ]);

  const blockedCrystallizationIds = new Set(
    openConflicts
      .map((conflict) => conflict.crystallizationId)
      .filter((value): value is string => Boolean(value)),
  );

  return activeExpertFrameworkSchema.parse({
    frameworkId: framework.id,
    framework: parsedLiveFramework.data,
    heuristics: approvedCrystallizations
      .filter((item) => !blockedCrystallizationIds.has(item.id))
      .map((item) => item.heuristic),
    openConflicts: openConflicts.map((conflict) => ({
      id: conflict.id,
      summary: conflict.summary,
      details: conflict.details ?? null,
    })),
    seedSource:
      framework.seedSource === "deep_default" ? "deep_default" : "expert_authored",
  });
}

const cachedGetActiveFrameworkBundleForLesson = unstable_cache(
  async (lessonId: string) => await getActiveFrameworkBundleForLesson(lessonId),
  ["learning-active-framework-bundle-for-lesson"],
  { revalidate: 60 },
);

export async function getCachedActiveFrameworkBundleForLesson(lessonId: string) {
  return await cachedGetActiveFrameworkBundleForLesson(lessonId);
}

export function isFrameworkEditable(framework: Pick<FrameworkRecord, "status">) {
  return framework.status !== TUTORING_STATUS.frameworkArchived;
}


