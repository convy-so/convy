import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

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
    } as Parameters<typeof updateLearningInterventionAction>[0]);
    if (!result.success) return apiError("VALIDATION_ERROR", result.error);
    return NextResponse.json(result);
  } catch (error) {
    return apiUnhandledError(error, "Failed to update intervention", "/api/learning/interventions/[interventionId]");
  }
}
