import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { getTopicWithMaterials } from "@/lib/learning/storage";
import {
  buildReadinessUnavailableFallback,
  getOrGenerateTopicReadiness,
  isReadinessQuotaError,
} from "@/lib/learning/readiness";
import { isMaterialAnalysisFailed } from "@/lib/learning/materials-route-service";

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
      return apiError("NOT_FOUND", "Topic not found");
    }

    try {
      const readiness = await getOrGenerateTopicReadiness({
        ...topic,
        materials: topic.materials.filter(
          (material) =>
            material.extractionStatus === "completed" &&
            material.indexingStatus === "completed" &&
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
    return handleLearningRouteError(error, "Failed to evaluate topic readiness", "/api/learning/topics/[topicId]/readiness");
  }
}
