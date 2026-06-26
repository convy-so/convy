import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { getLessonWithMaterials } from "@/features/tutoring/public-server";
import {
  buildReadinessUnavailableFallback,
  getOrGenerateLessonReadiness,
  isReadinessQuotaError,
} from "@/features/tutoring/server/readiness";
import { isMaterialAnalysisFailed } from "@/features/tutoring/server/materials-route-service";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const access = await getTeacherLessonAccess(session.user.id, lessonId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const lesson = await getLessonWithMaterials(lessonId);
    if (!lesson) {
      return apiError("NOT_FOUND", "Lesson not found");
    }

    try {
      const readiness = await getOrGenerateLessonReadiness({
        ...lesson,
        materials: lesson.materials.filter(
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
    return handleTutoringRouteError(error, "Failed to evaluate lesson readiness", "/api/lessons/[lessonId]/readiness");
  }
}

