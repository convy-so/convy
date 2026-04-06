import { NextResponse } from "next/server";

import { updateLearningInterventionAction } from "@/app/actions/classroom";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ interventionId: string }> },
) {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const { interventionId } = await params;
    const updatePayload =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? payload
        : {};
    const result = await updateLearningInterventionAction({
      ...updatePayload,
      interventionId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update intervention",
      },
      { status: 400 },
    );
  }
}
