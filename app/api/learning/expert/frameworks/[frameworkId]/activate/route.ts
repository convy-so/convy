import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  expertFrameworks,
  expertFrameworkVersions,
} from "@/db/schema";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getExpertAccessibleFramework } from "@/lib/learning/expert-access";
import { isAutoSeededPublishedPlaceholder } from "@/lib/learning/framework-live-version";
import { type ExpertFramework } from "@/lib/learning/types";
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

    await getDb().transaction(async (tx) => {
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
    });

    return NextResponse.json({
      success: true,
      data: {
        frameworkId: framework.id,
        versionId: version.id,
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
