import { and, asc, desc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
  expertRuntimeModels,
} from "@/db/schema";
import { createDefaultDeepFramework } from "@/lib/learning/framework-presets";
import type { ExpertTutorRuntimeModel } from "@/lib/learning/types";
import { expertTutorRuntimeModelSchema } from "@/lib/learning/types";

export async function ensureTopicFramework(params: {
  topicId: string;
  classroomId?: string | null;
}) {
  return await getDb().transaction(async (tx) => {
    const existing = await tx.query.expertFrameworks.findFirst({
      where: eq(expertFrameworks.topicId, params.topicId),
    });

    if (existing) {
      return existing;
    }

    const [framework] = await tx
      .insert(expertFrameworks)
      .values({
        id: nanoid(),
        topicId: params.topicId,
        classroomId: params.classroomId ?? null,
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
  topicId: string;
  frameworkVersionId?: string;
}) {
  return await getDb().query.expertCrystallizations.findMany({
    where: and(
      eq(expertCrystallizations.topicId, params.topicId),
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
  topicId: string;
  frameworkId: string;
  frameworkVersionId: string;
  runtimeModel: ExpertTutorRuntimeModel;
  conflictIds?: string[];
  status?: "draft" | "published" | "archived";
}) {
  const latest = await getDb().query.expertRuntimeModels.findFirst({
    where: eq(expertRuntimeModels.topicId, params.topicId),
    orderBy: [desc(expertRuntimeModels.version)],
  });

  const nextVersion = (latest?.version ?? 0) + 1;
  const [created] = await getDb()
    .insert(expertRuntimeModels)
    .values({
      id: nanoid(),
      topicId: params.topicId,
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
  return await getDb().query.expertRuntimeModels.findFirst({
    where: and(
      eq(expertRuntimeModels.topicId, topicId),
      eq(expertRuntimeModels.status, "published"),
    ),
    orderBy: [desc(expertRuntimeModels.version)],
  });
}
