import { NextResponse } from "next/server";
import { z } from "zod";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import {
  deleteDraftFramework,
  getFrameworkById,
  updateFrameworkDraft,
} from "@/features/tutoring/public-server";
import { expertFrameworkSchema } from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

const updateFrameworkSchema = z.object({
  draftFramework: expertFrameworkSchema,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    const framework = await getFrameworkById(frameworkId);

    if (!framework) {
      return apiError("NOT_FOUND", "Framework not found");
    }

    return NextResponse.json({
      success: true,
      data: framework,
    });
  } catch (error) {
    return handleTutoringRouteError(
      error,
      "Failed to load framework",
      "expert-framework:get",
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    const body = updateFrameworkSchema.parse(await request.json());
    const updated = await updateFrameworkDraft({
      frameworkId,
      draftFramework: body.draftFramework,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    if (error instanceof Error && error.message === "ARCHIVED_FRAMEWORK_READ_ONLY") {
      return apiError("VALIDATION_ERROR", "Archived frameworks are read-only.");
    }
    return handleTutoringRouteError(
      error,
      "Failed to update framework draft",
      "expert-framework:patch",
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    await deleteDraftFramework(frameworkId);

    return NextResponse.json({
      success: true,
      data: { frameworkId },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ONLY_NEVER_ACTIVATED_DRAFTS_CAN_BE_DELETED"
    ) {
      return apiError(
        "VALIDATION_ERROR",
        "Only draft frameworks that have never been activated can be deleted.",
      );
    }
    return handleTutoringRouteError(
      error,
      "Failed to delete framework",
      "expert-framework:delete",
    );
  }
}
