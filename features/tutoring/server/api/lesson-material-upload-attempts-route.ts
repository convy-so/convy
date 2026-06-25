import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { topicMaterialUploadAttempts } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getTeacherTopicOrNull,
} from "@/features/tutoring/server/materials-route-service";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";
import { serializeUploadAttempt } from "@/features/tutoring/server/api/lesson-material-upload-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    const attempts = await getDb().query.topicMaterialUploadAttempts.findMany({
      where: batchId
        ? and(
            eq(topicMaterialUploadAttempts.topicId, topicId),
            eq(topicMaterialUploadAttempts.batchId, batchId),
          )
        : eq(topicMaterialUploadAttempts.topicId, topicId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
    });

    return NextResponse.json({
      success: true,
      data: attempts.map(serializeUploadAttempt),
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load material upload attempts",
      "/api/learning/lessons/[lessonId]/material-upload-attempts",
    );
  }
}
