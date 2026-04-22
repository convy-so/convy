import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { expertFrameworkVersions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { getTeacherOwnedFramework } from "@/lib/learning/expert-access";
import { expertFrameworkSchema } from "@/lib/learning/types";

const createVersionSchema = z.object({
  artifact: expertFrameworkSchema,
  notes: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const { packId } = await params;
    const framework = await getTeacherOwnedFramework(session.user.id, packId);
    if (!framework) {
      return NextResponse.json({ error: "Framework not found" }, { status: 404 });
    }
    const versions = await getDb().query.expertFrameworkVersions.findMany({
      where: eq(expertFrameworkVersions.frameworkId, framework.id),
      orderBy: (table, { desc }) => [desc(table.version)],
    });
    return NextResponse.json({ success: true, data: versions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load framework versions" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const { packId } = await params;
    const framework = await getTeacherOwnedFramework(session.user.id, packId);
    if (!framework) {
      return NextResponse.json({ error: "Framework not found" }, { status: 404 });
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
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create framework version" },
      { status: 400 },
    );
  }
}
