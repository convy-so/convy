import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { lessonMaterialUploadAttempts } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getTeacherLessonOrNull,
} from "@/features/tutoring/server/materials-route-service";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";
import { serializeUploadAttempt } from "@/features/tutoring/server/api/lesson-material-upload-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const lesson = await getTeacherLessonOrNull(session.user.id, lessonId);
    if (!lesson) return apiError("UNAUTHORIZED", "Unauthorized");

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    const attempts = await getDb().query.lessonMaterialUploadAttempts.findMany({
      where: batchId
        ? and(
            eq(lessonMaterialUploadAttempts.lessonId, lessonId),
            eq(lessonMaterialUploadAttempts.batchId, batchId),
          )
        : eq(lessonMaterialUploadAttempts.lessonId, lessonId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
    });

    return NextResponse.json({
      success: true,
      data: attempts.map(serializeUploadAttempt),
    });
  } catch (error) {
    return handleTutoringRouteError(
      error,
      "Failed to load material upload attempts",
      "/api/lessons/[lessonId]/material-upload-attempts",
    );
  }
}

