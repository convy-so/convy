import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  expertConflicts,
  expertCrystallizations,
  expertFrameworks,
  expertFrameworkVersions,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { isExpert } from "@/lib/auth/dal";
import { getTeacherOwnedFramework } from "@/lib/learning/expert-access";
import { createRuntimeModel } from "@/lib/learning/storage";
import { expertTutorRuntimeModelSchema } from "@/lib/learning/types";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

const activateSchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    if (!isExpert(session.user)) {
      throw new Error("Unauthorized: Expert or admin access required");
    }
    const { packId } = await params;
    const body = activateSchema.parse(await request.json());

    const framework = await getTeacherOwnedFramework(session.user.id, packId);
    const version = await getDb().query.expertFrameworkVersions.findFirst({
      where: and(
        eq(expertFrameworkVersions.id, body.versionId),
        eq(expertFrameworkVersions.frameworkId, packId),
      ),
    });

    if (!framework || !version) {
      return apiError("NOT_FOUND", "Framework or version not found");
    }

    await getDb()
      .update(expertFrameworkVersions)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworkVersions.id, version.id));

    await getDb()
      .update(expertFrameworks)
      .set({
        activeVersionId: version.id,
        updatedAt: new Date(),
      })
      .where(eq(expertFrameworks.id, framework.id));

    const [crystallizations, conflicts] = await Promise.all([
      getDb().query.expertCrystallizations.findMany({
        where: and(
          eq(expertCrystallizations.topicId, framework.topicId ?? ""),
          eq(expertCrystallizations.status, "approved"),
        ),
      }),
      getDb().query.expertConflicts.findMany({
        where: and(
          eq(expertConflicts.topicId, framework.topicId ?? ""),
          eq(expertConflicts.status, "open"),
        ),
      }),
    ]);

    const blockedCrystallizations = new Set(
      conflicts
        .map((conflict) => conflict.crystallizationId)
        .filter((value): value is string => Boolean(value)),
    );

    const runtimeModel = expertTutorRuntimeModelSchema.parse({
      id: crypto.randomUUID(),
      version: 1,
      frameworkVersionId: version.id,
      framework: version.framework,
      heuristics: crystallizations
        .filter((item) => !blockedCrystallizations.has(item.id))
        .map((item) => item.heuristic),
      conflictIds: conflicts.map((conflict) => conflict.id),
      seedSource: version.seedSource === "deep_default" ? "deep_default" : "expert_authored",
    });

    const publishedRuntime = await createRuntimeModel({
      topicId: framework.topicId!,
      frameworkId: framework.id,
      frameworkVersionId: version.id,
      runtimeModel,
      conflictIds: runtimeModel.conflictIds,
      status: "published",
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
    return apiUnhandledError(
      error,
      "Failed to publish framework version",
      "expert-framework-activate:post",
    );
  }
}
