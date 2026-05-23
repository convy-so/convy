import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
  expertRuntimeModels,
} from "@/db/schema";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getExpertAccessibleFramework } from "@/lib/learning/expert-access";
import { isAutoSeededPublishedPlaceholder } from "@/lib/learning/framework-live-version";
import { expertTutorRuntimeModelSchema, type ExpertFramework } from "@/lib/learning/types";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const activateSchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;
    const { frameworkId } = await params;
    const body = activateSchema.parse(await request.json());

    const framework = await getExpertAccessibleFramework(frameworkId);
    const version = await getDb().query.expertFrameworkVersions.findFirst({
      where: and(
        eq(expertFrameworkVersions.id, body.versionId),
        eq(expertFrameworkVersions.frameworkId, frameworkId),
      ),
    });

    if (!framework || !version) {
      return apiError("NOT_FOUND", "Framework or version not found");
    }

    const artifact = version.framework as ExpertFramework;
    if (
      isAutoSeededPublishedPlaceholder({
        seedSource: version.seedSource,
        framework: artifact,
      })
    ) {
      return apiError(
        "VALIDATION_ERROR",
        "Add framework instructions and save a draft before publishing. The auto-seeded placeholder cannot go live.",
      );
    }

    if (!artifact.markdownContent?.trim()) {
      return apiError(
        "VALIDATION_ERROR",
        "Add framework instructions in the Markdown field before publishing.",
      );
    }

    const publishedRuntime = await getDb().transaction(async (tx) => {
      await tx
        .update(expertFrameworkVersions)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedByUserId: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(expertFrameworkVersions.id, version.id));

      await tx
        .update(expertFrameworks)
        .set({
          activeVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(expertFrameworks.id, framework.id));

      const [crystallizations, conflicts, latestRuntime] = await Promise.all([
        tx.query.expertCrystallizations.findMany({
          where: and(
            eq(expertCrystallizations.courseId, framework.courseId),
            eq(expertCrystallizations.status, "approved"),
          ),
        }),
        tx.query.expertConflicts.findMany({
          where: and(
            eq(expertConflicts.courseId, framework.courseId),
            eq(expertConflicts.status, "open"),
          ),
        }),
        tx.query.expertRuntimeModels.findFirst({
          where: eq(expertRuntimeModels.courseId, framework.courseId),
          orderBy: [desc(expertRuntimeModels.version)],
        }),
      ]);

      const blockedCrystallizations = new Set(
        conflicts
          .map((conflict) => conflict.crystallizationId)
          .filter((value): value is string => Boolean(value)),
      );

      const nextVersion = (latestRuntime?.version ?? 0) + 1;
      const runtimeModel = expertTutorRuntimeModelSchema.parse({
        id: crypto.randomUUID(),
        version: nextVersion,
        frameworkVersionId: version.id,
        framework: version.framework,
        compiledPolicy: null,
        heuristics: crystallizations
          .filter((item) => !blockedCrystallizations.has(item.id))
          .map((item) => item.heuristic),
        conflictIds: conflicts.map((conflict) => conflict.id),
        seedSource: version.seedSource === "deep_default" ? "deep_default" : "expert_authored",
      });

      const [createdRuntime] = await tx
        .insert(expertRuntimeModels)
        .values({
          id: nanoid(),
          courseId: framework.courseId,
          topicId: framework.topicId ?? framework.topic?.id ?? null,
          frameworkId: framework.id,
          frameworkVersionId: version.id,
          version: nextVersion,
          status: "published",
          runtimeModel,
          conflictIds: runtimeModel.conflictIds,
          publishedAt: new Date(),
          publishedByUserId: session.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return createdRuntime;
    });

    return NextResponse.json({
      success: true,
      data: {
        frameworkId: framework.id,
        versionId: version.id,
        runtimeModelId: publishedRuntime.id,
        runtimeModelVersion: publishedRuntime.version,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return handleLearningRouteError(
      error,
      "Failed to publish framework version",
      "expert-framework-activate:post",
    );
  }
}
