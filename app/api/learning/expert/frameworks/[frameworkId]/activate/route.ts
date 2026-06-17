import { NextResponse } from "next/server";

import { requireExpertSession } from "@/lib/learning/expert-route-guard";
import { getTutorCapability } from "@/lib/learning/tutor-capabilities";
import {
  activateFramework,
  getFrameworkById,
} from "@/lib/learning/storage";
import {
  expertFrameworkSchema,
  getIncompleteExpertFrameworkCapabilityIds,
  type ExpertFramework,
} from "@/lib/learning/types";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function POST(
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

    const artifact = expertFrameworkSchema.parse(
      framework.draftFramework,
    ) as ExpertFramework;

    if (!artifact.markdownContent?.trim()) {
      return apiError(
        "VALIDATION_ERROR",
        "Add framework instructions in the Markdown field before activation.",
      );
    }

    const missingCapabilityIds =
      getIncompleteExpertFrameworkCapabilityIds(artifact);
    if (missingCapabilityIds.length > 0) {
      const missingLabels = missingCapabilityIds
        .map((id) => getTutorCapability(id)?.label ?? id)
        .join(", ");
      return apiError(
        "VALIDATION_ERROR",
        `Add capability guidance before activation: ${missingLabels}.`,
      );
    }

    const updated = await activateFramework({
      frameworkId,
      activatedByUserId: expert.session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        frameworkId: updated.id,
        status: updated.status,
        activatedAt: updated.activatedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ARCHIVED_FRAMEWORK_READ_ONLY") {
      return apiError("VALIDATION_ERROR", "Archived frameworks cannot be activated.");
    }
    return handleLearningRouteError(
      error,
      "Failed to activate framework",
      "expert-framework-activate:post",
    );
  }
}
