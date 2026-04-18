import { NextResponse } from "next/server";
import { z } from "zod";

import { activateExpertGuidanceVersion } from "@/app/actions/ai-ops";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";

const activateSchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const { packId } = await params;
    const body = activateSchema.parse(await request.json());
    const result = await activateExpertGuidanceVersion({
      packId,
      versionId: body.versionId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to activate version" },
      { status: 400 },
    );
  }
}
