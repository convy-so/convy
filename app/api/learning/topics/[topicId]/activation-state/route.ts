import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { topicMaterialUploadAttempts } from "@/db/schema";
import { apiError } from "@/lib/api/error-contract";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getActiveFrameworkForCourse } from "@/lib/learning/framework-runtime-storage";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { getTeacherTopicOrNull } from "@/lib/learning/materials-route-service";
import { getTopicActivationMaterialGate } from "@/lib/learning/materials-route-service";
import { getTopicWithMaterials } from "@/lib/learning/storage";

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
      return apiError("NOT_FOUND", "Topic not found");
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
      "/api/learning/topics/[topicId]/activation-state",
    );
  }
}
