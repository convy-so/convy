import { and, asc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { unstable_cache } from "next/cache";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  learningTopics,
} from "@/db/schema";
import { getCourseById } from "@/lib/learning/course-service";
import { createEmptyExpertFramework } from "@/lib/learning/framework-presets";
import {
  getFrameworkRecord,
  listFrameworkRecords,
  type FrameworkRecord,
} from "@/lib/learning/framework-records";
import {
  activeExpertFrameworkSchema,
  expertFrameworkSchema,
  type ActiveExpertFramework,
  type ExpertFramework,
} from "@/lib/learning/types";

export async function getCourseFrameworks(courseId: string, includeArchived = false) {
  return await listFrameworkRecords({ courseId, includeArchived });
}

export async function getFrameworkById(frameworkId: string) {
  return await getFrameworkRecord(frameworkId);
}

export async function getActiveFrameworkForCourse(courseId: string) {
  const active = (await getCourseFrameworks(courseId, true)).find(
    (candidate) => candidate.status === "active",
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
      status: "draft",
      seedSource: "expert_authored",
      draftFramework: artifact,
      liveFramework: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return framework;
}

export async function updateFrameworkDraft(params: {
  frameworkId: string;
  draftFramework: ExpertFramework;
}) {
  const framework = await getFrameworkById(params.frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === "archived") {
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

  return updated;
}

export async function activateFramework(params: {
  frameworkId: string;
  activatedByUserId: string;
}) {
  const framework = await getFrameworkById(params.frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === "archived") {
    throw new Error("ARCHIVED_FRAMEWORK_READ_ONLY");
  }

  const artifact = expertFrameworkSchema.parse(framework.draftFramework);

  return await getDb().transaction(async (tx) => {
    await tx
      .update(expertFrameworks)
      .set({
        status: "inactive",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expertFrameworks.courseId, framework.courseId),
          eq(expertFrameworks.status, "active"),
        ),
      );

    const [updated] = await tx
      .update(expertFrameworks)
      .set({
        name: artifact.name,
        description: artifact.description || null,
        status: "active",
        liveFramework: artifact,
        activatedAt: new Date(),
        activatedByUserId: params.activatedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id))
      .returning();

    return updated;
  });
}

export async function archiveFramework(frameworkId: string) {
  const framework = await getFrameworkById(frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status === "active") {
    throw new Error("ACTIVE_FRAMEWORK_CANNOT_BE_ARCHIVED");
  }

  const [updated] = await getDb()
    .update(expertFrameworks)
    .set({
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expertFrameworks.id, frameworkId))
    .returning();

  return updated;
}

export async function deleteDraftFramework(frameworkId: string) {
  const framework = await getFrameworkById(frameworkId);
  if (!framework) {
    throw new Error("Framework not found");
  }
  if (framework.status !== "draft" || framework.activatedAt) {
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
      eq(expertCrystallizations.status, "approved"),
      or(
        eq(expertCrystallizations.relevanceScope, "general"),
        and(
          eq(expertCrystallizations.relevanceScope, "framework_specific"),
          eq(expertCrystallizations.frameworkId, params.frameworkId ?? ""),
        ),
      ),
    ),
    orderBy: [asc(expertCrystallizations.createdAt)],
  });
}

export async function listOpenConflicts(params: { topicId: string }) {
  return await getDb().query.expertConflicts.findMany({
    where: and(
      eq(expertConflicts.topicId, params.topicId),
      eq(expertConflicts.status, "open"),
    ),
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
  });
}

export async function getActiveFrameworkBundleForTopic(
  topicId: string,
): Promise<ActiveExpertFramework> {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
  });
  if (!topic) {
    throw new Error("Topic not found.");
  }

  const framework = await getActiveFrameworkForCourse(topic.courseId);
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

  const [approvedCrystallizations, openConflicts] = await Promise.all([
    listApprovedCrystallizations({
      courseId: framework.courseId,
      frameworkId: framework.id,
    }),
    listOpenConflicts({ topicId }),
  ]);

  const blockedCrystallizationIds = new Set(
    openConflicts
      .map((conflict) => conflict.crystallizationId)
      .filter((value): value is string => Boolean(value)),
  );

  return activeExpertFrameworkSchema.parse({
    frameworkId: framework.id,
    framework: framework.liveFramework,
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

const cachedGetActiveFrameworkBundleForTopic = unstable_cache(
  async (topicId: string) => await getActiveFrameworkBundleForTopic(topicId),
  ["learning-active-framework-bundle-for-topic"],
  { revalidate: 60 },
);

export async function getCachedActiveFrameworkBundleForTopic(topicId: string) {
  return await cachedGetActiveFrameworkBundleForTopic(topicId);
}

export function isFrameworkEditable(framework: Pick<FrameworkRecord, "status">) {
  return framework.status !== "archived";
}
