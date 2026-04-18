import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createExpertGuidanceVersion,
  getExpertGuidanceVersionReleaseReadiness,
} from "@/app/actions/ai-ops";
import { getDb } from "@/db";
import { expertGuidanceVersions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";

const createVersionSchema = z.object({
  artifact: z.record(z.string(), z.unknown()),
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
    const versions = await getDb().query.expertGuidanceVersions.findMany({
      where: eq(expertGuidanceVersions.packId, packId),
      orderBy: (table, { desc }) => [desc(table.version)],
    });
    const versionsWithReadiness = await Promise.all(
      versions.map(async (version) => ({
        ...version,
        releaseReadiness: await getExpertGuidanceVersionReleaseReadiness({
          packId,
          versionId: version.id,
        }),
      })),
    );
    return NextResponse.json({ success: true, data: versionsWithReadiness });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load versions" },
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
    const body = createVersionSchema.parse(await request.json());
    const version = await createExpertGuidanceVersion({
      packId,
      artifact: body.artifact,
      notes: body.notes,
    });
    return NextResponse.json({ success: true, data: version });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create asset version" },
      { status: 400 },
    );
  }
}
