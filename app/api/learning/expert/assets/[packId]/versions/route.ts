import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { expertFrameworkVersions } from "@/db/schema";
import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getTeacherOwnedFramework } from "@/lib/learning/expert-access";
import { expertFrameworkSchema } from "@/lib/learning/types";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

const createVersionSchema = z.object({
  artifact: expertFrameworkSchema,
  notes: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;
    const { packId } = await params;
    const framework = await getTeacherOwnedFramework(session.user.id, packId);
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
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;
    const { packId } = await params;
    const framework = await getTeacherOwnedFramework(session.user.id, packId);
    if (!framework) {
      return apiError("NOT_FOUND", "Framework not found");
    }
    const body = createVersionSchema.parse(await request.json());
    const existing = await getDb().query.expertFrameworkVersions.findMany({
      where: eq(expertFrameworkVersions.frameworkId, framework.id),
      orderBy: (table, { desc }) => [desc(table.version)],
      limit: 1,
    });
    const versionNumber = (existing[0]?.version ?? 0) + 1;

    const [version] = await getDb()
      .insert(expertFrameworkVersions)
      .values({
        id: crypto.randomUUID(),
        frameworkId: framework.id,
        version: versionNumber,
        status: "draft",
        seedSource: "expert_authored",
        framework: body.artifact,
        notes: body.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ success: true, data: version });
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
