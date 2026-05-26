import { and, asc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
  learningTopics,
} from "@/db/schema";
import {
  getCourseById,
  getCourseByKey,
} from "@/lib/learning/course-service";
import { createEmptyExpertFramework } from "@/lib/learning/framework-presets";
import { listFrameworksWithTopicLite } from "@/lib/learning/framework-records";
import {
  activeExpertFrameworkSchema,
  type ActiveExpertFramework,
} from "@/lib/learning/types";

async function findFrameworkForCourseId(courseId: string) {
  const frameworks = await listFrameworksWithTopicLite();

  return frameworks.find((framework) => framework.courseId === courseId) ?? null;
}

export async function getSubjectFramework(params: {
  courseId?: string;
  subjectKey?: string;
}) {
  const course =
    (params.courseId ? await getCourseById(params.courseId) : null) ??
    (params.subjectKey ? await getCourseByKey(params.subjectKey) : null);

  if (!course) {
    return null;
  }

  return findFrameworkForCourseId(course.id);
}

export async function getTopicFramework(params: { topicId: string }) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
  });

  if (!topic) {
    return null;
  }

  return findFrameworkForCourseId(topic.courseId);
}

export async function createExpertFrameworkForCourse(params: {
  courseId: string;
  subjectKey: string;
  name: string;
  description?: string;
}) {
  const existing = await findFrameworkForCourseId(params.courseId);
  if (existing) {
    throw new Error("FRAMEWORK_ALREADY_EXISTS");
  }

  const course = await getCourseById(params.courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  const artifact = createEmptyExpertFramework({
    name: params.name,
    description: params.description ?? "",
  });

  return await getDb().transaction(async (tx) => {
    const [framework] = await tx
      .insert(expertFrameworks)
      .values({
        id: nanoid(),
        courseId: course.id,
        topicId: null,
        classroomId: null,
        subjectKey: params.subjectKey,
        name: params.name,
        description: params.description ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await tx.insert(expertFrameworkVersions).values({
      id: nanoid(),
      frameworkId: framework.id,
      version: 1,
      status: "draft",
      seedSource: "expert_authored",
      framework: artifact,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      ...framework,
      activeVersionId: null,
    };
  });
}

export async function getActiveFrameworkVersion(topicId: string) {
  const framework = await getTopicFramework({ topicId });
  if (!framework?.activeVersionId) {
    return null;
  }

  return await getDb().query.expertFrameworkVersions.findFirst({
    where: and(
      eq(expertFrameworkVersions.frameworkId, framework.id),
      eq(expertFrameworkVersions.id, framework.activeVersionId),
    ),
  });
}

export async function listApprovedCrystallizations(params: {
  courseId: string;
  frameworkVersionId?: string;
}) {
  return await getDb().query.expertCrystallizations.findMany({
    where: and(
      eq(expertCrystallizations.courseId, params.courseId),
      eq(expertCrystallizations.status, "approved"),
      or(
        eq(expertCrystallizations.relevanceScope, "general"),
        and(
          eq(expertCrystallizations.relevanceScope, "framework_specific"),
          eq(expertCrystallizations.frameworkVersionId, params.frameworkVersionId ?? ""),
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

export async function getActiveExpertFrameworkBundle(
  topicId: string,
): Promise<ActiveExpertFramework> {
  const framework = await getTopicFramework({ topicId });
  if (!framework) {
    throw new Error(
      "No expert framework exists for this course. Create and publish a framework before activating tutoring.",
    );
  }

  const frameworkVersion = await getActiveFrameworkVersion(topicId);
  if (!frameworkVersion) {
    throw new Error(
      "No published framework version is active for this course. Publish a framework version in the expert studio first.",
    );
  }

  const [approvedCrystallizations, openConflicts] = await Promise.all([
    listApprovedCrystallizations({
      courseId: framework.courseId,
      frameworkVersionId: frameworkVersion.id,
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
    frameworkVersionId: frameworkVersion.id,
    framework: frameworkVersion.framework,
    heuristics: approvedCrystallizations
      .filter((item) => !blockedCrystallizationIds.has(item.id))
      .map((item) => item.heuristic),
    openConflicts: openConflicts.map((conflict) => ({
      id: conflict.id,
      summary: conflict.summary,
      details: conflict.details ?? null,
    })),
    seedSource:
      frameworkVersion.seedSource === "deep_default"
        ? "deep_default"
        : "expert_authored",
  });
}
