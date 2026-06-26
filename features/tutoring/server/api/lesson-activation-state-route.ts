import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/shared/db";
import { lessonMaterialUploadAttempts } from "@/shared/db/schema";
import { apiError } from "@/shared/http/api-error";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getActiveFrameworkForCourse } from "@/features/tutoring/server/framework-runtime-storage";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";
import { getTeacherLessonOrNull } from "@/features/tutoring/server/materials-route-service";
import { getLessonActivationMaterialGate } from "@/features/tutoring/server/materials-route-service";
import { getLessonWithMaterials } from "@/features/tutoring/public-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const lesson = await getTeacherLessonOrNull(session.user.id, lessonId);

    if (!lesson) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const lessonWithMaterials = await getLessonWithMaterials(lessonId);
    if (!lessonWithMaterials) {
      return apiError("NOT_FOUND", "Lesson not found");
    }

    const attempts = await getDb().query.lessonMaterialUploadAttempts.findMany({
      where: eq(lessonMaterialUploadAttempts.lessonId, lessonId),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    });

    const activationState = getLessonActivationMaterialGate({
      lesson: lessonWithMaterials,
      materials: lessonWithMaterials.materials,
      attempts,
    });

    if (activationState.ready) {
      const activeFramework = await getActiveFrameworkForCourse(lessonWithMaterials.courseId);
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
    return handleTutoringRouteError(
      error,
      "Failed to evaluate activation readiness",
      "/api/lessons/[lessonId]/activation-state",
    );
  }
}

