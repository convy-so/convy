import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/shared/db";
import { topicMaterialUploadAttempts } from "@/shared/db/schema";
import { apiError } from "@/shared/http/api-error";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getActiveFrameworkForCourse } from "@/features/tutoring/server/framework-runtime-storage";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";
import { getTeacherTopicOrNull } from "@/features/tutoring/server/materials-route-service";
import { getTopicActivationMaterialGate } from "@/features/tutoring/server/materials-route-service";
import { getTopicWithMaterials } from "@/features/tutoring/public-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const topicWithMaterials = await getTopicWithMaterials(topicId);
    if (!topicWithMaterials) {
      return apiError("NOT_FOUND", "Lesson not found");
    }

    const attempts = await getDb().query.topicMaterialUploadAttempts.findMany({
      where: eq(topicMaterialUploadAttempts.topicId, topicId),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    });

    const activationState = getTopicActivationMaterialGate({
      topic: topicWithMaterials,
      materials: topicWithMaterials.materials,
      attempts,
    });

    if (activationState.ready) {
      const activeFramework = await getActiveFrameworkForCourse(topicWithMaterials.courseId);
      if (!activeFramework?.liveFramework) {
        return NextResponse.json({
          success: true,
          data: {
            ready: false,
            reason:
              "Activate an expert framework before activating tutoring for this lesson.",
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: activationState,
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to evaluate activation readiness",
      "/api/learning/lessons/[lessonId]/activation-state",
    );
  }
}
