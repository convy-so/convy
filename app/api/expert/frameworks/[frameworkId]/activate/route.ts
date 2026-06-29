import { NextResponse } from "next/server";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { TUTOR_CAPABILITY_IDS } from "@/features/tutoring/server/tutor-capabilities";
import {
  activateFramework,
  FRAMEWORK_WRITE_FORBIDDEN_ERROR,
  getFrameworkById,
} from "@/features/tutoring/public-server";
import { expertFrameworkSchema } from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

function getCapabilityLabel(capabilityId: (typeof TUTOR_CAPABILITY_IDS)[number]) {
  switch (capabilityId) {
    case "search_image":
      return "Educational images";
    case "search_video":
      return "Educational videos";
    case "administer_quiz":
      return "Quizzes";
    case "grade_student_work":
      return "Grading and feedback";
    case "finish_session":
      return "Finish session";
  }
}

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
      return apiError(
        "VALIDATION_ERROR",
        parsedArtifact.error.errors[0]?.message ?? "Framework validation failed.",
      );
    }

    const draftFramework = parsedArtifact.data;

    if (!draftFramework.markdownContent?.trim()) {
      return apiError(
        "VALIDATION_ERROR",
        "Add framework instructions in the Markdown field before activation.",
      );
    }

    const missingCapabilityIds = TUTOR_CAPABILITY_IDS.filter(
      (capabilityId) => !draftFramework.capabilityGuidance[capabilityId].policy.trim(),
    );
    if (missingCapabilityIds.length > 0) {
      const missingLabels = missingCapabilityIds
        .map((id) => getCapabilityLabel(id))
        .join(", ");
      return apiError(
        "VALIDATION_ERROR",
        `Add required capability policy before activation: ${missingLabels}.`,
      );
    }

    const updated = await activateFramework({
      actorUserId: expert.session.user.id,
      frameworkId,
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
    if (error instanceof Error && error.message === FRAMEWORK_WRITE_FORBIDDEN_ERROR) {
      return apiError(
        "UNAUTHORIZED",
        "Only the expert who created this framework can activate it.",
      );
    }
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
