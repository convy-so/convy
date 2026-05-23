import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { expertFrameworkVersions } from "@/db/schema";
import { compileFrameworkArtifact } from "@/lib/learning/framework-compiler";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getExpertAccessibleFramework } from "@/lib/learning/expert-access";
import { expertFrameworkSchema } from "@/lib/learning/types";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const createVersionSchema = z.object({
  artifact: expertFrameworkSchema,
  notes: z.string().optional(),
});

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    const framework = await getExpertAccessibleFramework(frameworkId);
    if (!framework) {
      return apiError("NOT_FOUND", "Framework not found");
    }
    const versions = await getDb().query.expertFrameworkVersions.findMany({
      where: eq(expertFrameworkVersions.frameworkId, framework.id),
      orderBy: (table, { desc }) => [desc(table.version)],
    });
    return NextResponse.json({ success: true, data: versions });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load framework versions",
      "expert-framework-versions:get",
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    const framework = await getExpertAccessibleFramework(frameworkId);
    if (!framework) {
      return apiError("NOT_FOUND", "Framework not found");
    }
    const body = createVersionSchema.parse(await request.json());
    const compiled = await compileFrameworkArtifact(body.artifact);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const version = await getDb().transaction(async (tx) => {
          const existing = await tx.query.expertFrameworkVersions.findMany({
            where: eq(expertFrameworkVersions.frameworkId, framework.id),
            orderBy: (table, { desc }) => [desc(table.version)],
            limit: 1,
          });
          const versionNumber = (existing[0]?.version ?? 0) + 1;

          const [createdVersion] = await tx
            .insert(expertFrameworkVersions)
            .values({
              id: crypto.randomUUID(),
              frameworkId: framework.id,
              version: versionNumber,
              status: "draft",
              seedSource: "expert_authored",
              framework: compiled.framework,
              notes: body.notes ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          return createdVersion;
        });

        return NextResponse.json({ success: true, data: version });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    return apiError(
      "CONFLICT",
      "Could not allocate a unique framework version number. Please retry.",
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return handleLearningRouteError(
      error,
      "Failed to create framework version",
      "expert-framework-versions:post",
    );
  }
}
