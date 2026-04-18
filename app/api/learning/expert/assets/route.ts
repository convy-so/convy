import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createExpertGuidancePack,
  listExpertGuidanceSummary,
} from "@/app/actions/ai-ops";

const createPackSchema = z.object({
  artifactType: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  targetScope: z.string().default("global"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  try {
    const packs = await listExpertGuidanceSummary();
    return NextResponse.json({
      success: true,
      data: packs.filter((pack) => pack.feature === "tutoring_chat"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load assets" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = createPackSchema.parse(await request.json());
    const pack = await createExpertGuidancePack({
      feature: "tutoring_chat",
      artifactType: body.artifactType,
      name: body.name,
      description: body.description,
      targetScope: body.targetScope,
      metadata: body.metadata,
    });
    return NextResponse.json({ success: true, data: pack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create asset pack" },
      { status: 400 },
    );
  }
}
