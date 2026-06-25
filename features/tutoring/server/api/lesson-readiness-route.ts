import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherTopicAccess } from "@/features/tutoring/server/access";
import { getTopicWithMaterials } from "@/features/tutoring/public-server";
import {
  buildReadinessUnavailableFallback,
  getOrGenerateTopicReadiness,
  isReadinessQuotaError,
} from "@/features/tutoring/server/readiness";
import { isMaterialAnalysisFailed } from "@/features/tutoring/server/materials-route-service";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const access = await getTeacherTopicAccess(session.user.id, topicId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const topic = await getTopicWithMaterials(topicId);
    if (!topic) {
      return apiError("NOT_FOUND", "Lesson not found");
    }

    try {
      const readiness = await getOrGenerateTopicReadiness({
        ...topic,
        materials: topic.materials.filter(
          (material) =>
            material.extractionStatus === LEARNING_STATUS.materialCompleted &&
            material.indexingStatus === LEARNING_STATUS.materialCompleted &&
            !isMaterialAnalysisFailed(material.analysis),
        ),
      });

      return NextResponse.json({
        success: true,
        data: readiness.data,
        generatedAt: readiness.generatedAt,
        cacheStatus: readiness.cacheStatus,
      });
    } catch (error) {
      if (isReadinessQuotaError(error)) {
        return NextResponse.json({
          success: true,
          data: buildReadinessUnavailableFallback(),
          generatedAt: null,
          cacheStatus: "unavailable",
        });
      }

      throw error;
    }
  } catch (error) {
    return handleLearningRouteError(error, "Failed to evaluate lesson readiness", "/api/learning/lessons/[lessonId]/readiness");
  }
}
