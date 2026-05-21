import { and, asc, desc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
  expertRuntimeModels,
  learningTopics,
} from "@/db/schema";
import {
  getCourseById,
  getCourseByKey,
} from "@/lib/learning/course-service";
import { createDefaultDeepFramework } from "@/lib/learning/framework-presets";
import { listFrameworksWithTopicLite } from "@/lib/learning/framework-records";
import type { ExpertTutorRuntimeModel } from "@/lib/learning/types";
import { expertTutorRuntimeModelSchema } from "@/lib/learning/types";

async function findFrameworkForCourseId(courseId: string) {
  const frameworks = await listFrameworksWithTopicLite();

  return frameworks.find((framework) => framework.courseId === courseId) ?? null;
}

async function findAnchorTopicForSubjectKey(subjectKey: string) {
  return await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.subjectKey, subjectKey),
    orderBy: [desc(learningTopics.updatedAt)],
  });
}

export async function ensureSubjectFramework(params: {
  subjectKey: string;
  courseId?: string;
  topicId?: string;
  classroomId?: string | null;
}) {
  const course =
    (params.courseId ? await getCourseById(params.courseId) : null) ??
    (await getCourseByKey(params.subjectKey));

  if (!course) {
    throw new Error("Course not found");
  }

  const existing = await findFrameworkForCourseId(course.id);
  if (existing) {
    return existing;
  }

  let anchorTopic = params.topicId
    ? await getDb().query.learningTopics.findFirst({
        where: eq(learningTopics.id, params.topicId),
      })
    : null;

  if (anchorTopic && anchorTopic.subjectKey !== params.subjectKey) {
    anchorTopic = null;
  }

  if (!anchorTopic) {
    anchorTopic = await findAnchorTopicForSubjectKey(params.subjectKey);
  }

  if (!anchorTopic) {
    anchorTopic = await getDb().query.learningTopics.findFirst({
      where: eq(learningTopics.courseId, course.id),
      orderBy: [desc(learningTopics.updatedAt)],
    });
  }

  if (!anchorTopic) {
    return await getDb().transaction(async (tx) => {
      const [framework] = await tx
        .insert(expertFrameworks)
        .values({
          id: nanoid(),
          courseId: course.id,
          topicId: null,
          classroomId: params.classroomId ?? null,
          subjectKey: course.key,
          name: `${course.title} DEEP`,
          description:
            "Default seeded framework. Experts can edit, replace, or delete it.",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const defaultFramework = createDefaultDeepFramework();
      const [version] = await tx
        .insert(expertFrameworkVersions)
        .values({
          id: nanoid(),
          frameworkId: framework.id,
          version: 1,
          status: "published",
          seedSource: "deep_default",
          framework: defaultFramework,
          publishedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx
        .update(expertFrameworks)
        .set({
          activeVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(expertFrameworks.id, framework.id));

      return {
        ...framework,
        activeVersionId: version.id,
      };
    });
  }

  return await getDb().transaction(async (tx) => {
    const [framework] = await tx
      .insert(expertFrameworks)
      .values({
        id: nanoid(),
        courseId: course.id,
        topicId: anchorTopic.id,
        classroomId: params.classroomId ?? anchorTopic.classroomId ?? null,
        subjectKey: course.key,
        name: "DEEP",
        description:
          "Default seeded framework. Experts can edit, replace, or delete it.",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const defaultFramework = createDefaultDeepFramework();
    const [version] = await tx
      .insert(expertFrameworkVersions)
      .values({
        id: nanoid(),
        frameworkId: framework.id,
        version: 1,
        status: "published",
        seedSource: "deep_default",
        framework: defaultFramework,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await tx
      .update(expertFrameworks)
      .set({
        activeVersionId: version.id,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id));

    return {
      ...framework,
      activeVersionId: version.id,
    };
  });
}

export async function ensureTopicFramework(params: {
  topicId: string;
  classroomId?: string | null;
}) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
  });

  if (!topic) {
    throw new Error("Topic not found");
  }

  return await ensureSubjectFramework({
    subjectKey: topic.subjectKey,
    courseId: topic.courseId,
    topicId: topic.id,
    classroomId: params.classroomId ?? topic.classroomId ?? null,
  });
}

export async function getActiveFrameworkVersion(topicId: string) {
  const framework = await ensureTopicFramework({ topicId });
  return await getDb().query.expertFrameworkVersions.findFirst({
    where: and(
      eq(expertFrameworkVersions.frameworkId, framework.id),
      eq(expertFrameworkVersions.id, framework.activeVersionId ?? ""),
    ),
  });
}

export async function listApprovedCrystallizations(params: {
  courseId: string;
  topicId: string;
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
    orderBy: [desc(expertConflicts.createdAt)],
  });
}

export async function createRuntimeModel(params: {
  courseId: string;
  topicId?: string | null;
  frameworkId: string;
  frameworkVersionId: string;
  runtimeModel: ExpertTutorRuntimeModel;
  conflictIds?: string[];
  status?: "draft" | "published" | "archived";
}) {
  const latest = await getDb().query.expertRuntimeModels.findFirst({
    where: eq(expertRuntimeModels.courseId, params.courseId),
    orderBy: [desc(expertRuntimeModels.version)],
  });

  const nextVersion = (latest?.version ?? 0) + 1;
  const [created] = await getDb()
    .insert(expertRuntimeModels)
    .values({
      id: nanoid(),
      courseId: params.courseId,
      topicId: params.topicId ?? null,
      frameworkId: params.frameworkId,
      frameworkVersionId: params.frameworkVersionId,
      version: nextVersion,
      status: params.status ?? "published",
      runtimeModel: expertTutorRuntimeModelSchema.parse({
        ...params.runtimeModel,
        version: nextVersion,
      }),
      conflictIds: params.conflictIds ?? [],
      publishedAt: params.status === "draft" ? null : new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function getPublishedRuntimeModel(topicId: string) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    columns: {
      courseId: true,
    },
  });

  if (!topic) {
    return null;
  }

  return await getDb().query.expertRuntimeModels.findFirst({
    where: and(
      eq(expertRuntimeModels.courseId, topic.courseId),
      eq(expertRuntimeModels.status, "published"),
    ),
    orderBy: [desc(expertRuntimeModels.version)],
  });
}
