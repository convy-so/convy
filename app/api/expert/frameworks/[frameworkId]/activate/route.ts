import { NextResponse } from "next/server";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { getTutorCapability } from "@/features/tutoring/server/tutor-capabilities";
import {
  activateFramework,
  getFrameworkById,
} from "@/features/tutoring/public-server";
import {
  expertFrameworkSchema,
  getIncompleteExpertFrameworkCapabilityIds,
  isLegacyExpertFrameworkCapabilityGuidance,
} from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

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

    const parsedArtifact = expertFrameworkSchema.safeParse(
      framework.draftFramework,
    );
    if (!parsedArtifact.success) {
      const rawCapabilityGuidance =
        typeof framework.draftFramework === "object" && framework.draftFramework !== null
          ? (framework.draftFramework as Record<string, unknown>).capabilityGuidance
          : undefined;
      if (isLegacyExpertFrameworkCapabilityGuidance(rawCapabilityGuidance)) {
        return apiError(
          "VALIDATION_ERROR",
          "This framework still uses the retired capability format. Re-author capability settings in the framework editor before activation.",
        );
      }

      return apiError(
        "VALIDATION_ERROR",
        parsedArtifact.error.errors[0]?.message ?? "Framework validation failed.",
      );
    }

    const artifact = parsedArtifact.data;

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
        `Add required capability policy before activation: ${missingLabels}.`,
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
    return handleTutoringRouteError(
      error,
      "Failed to activate framework",
      "expert-framework-activate:post",
    );
  }
}
