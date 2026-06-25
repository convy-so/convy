import { NextResponse } from "next/server";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { archiveFramework } from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ frameworkId: string }> },
) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { frameworkId } = await params;
    const updated = await archiveFramework(frameworkId);

    return NextResponse.json({
      success: true,
      data: {
        frameworkId: updated.id,
        status: updated.status,
        archivedAt: updated.archivedAt,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACTIVE_FRAMEWORK_CANNOT_BE_ARCHIVED"
    ) {
      return apiError(
        "VALIDATION_ERROR",
        "Activate a replacement before archiving the current live framework.",
      );
    }
    return handleLearningRouteError(
      error,
      "Failed to archive framework",
      "expert-framework-archive:post",
    );
  }
}
