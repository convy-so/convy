import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { topicMaterialUploadAttempts } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  getTeacherTopicOrNull,
  normalizeLearningMaterialUploadAttemptStage,
} from "@/lib/learning/materials-route-service";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

function serializeUploadAttempt(attempt: {
  id: string;
  previousAttemptId?: string | null;
  batchId: string;
  topicId: string;
  uploadedByUserId: string;
  fileName: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status: string;
  stage: string;
  userMessage?: string | null;
  retryable?: boolean | null;
  queuedAt?: Date | null;
  processingStartedAt?: Date | null;
  failedAt?: Date | null;
  completedAt?: Date | null;
  failureMessage?: string | null;
  materialId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: attempt.id,
    previousAttemptId: attempt.previousAttemptId ?? null,
    batchId: attempt.batchId,
    topicId: attempt.topicId,
    uploadedByUserId: attempt.uploadedByUserId,
    fileName: attempt.fileName,
    title: attempt.title ?? null,
    description: attempt.description ?? null,
    mimeType: attempt.mimeType ?? null,
    sizeBytes: attempt.sizeBytes ?? null,
    storageBucket: attempt.storageBucket ?? null,
    storagePath: attempt.storagePath ?? null,
    status: attempt.status,
    stage: normalizeLearningMaterialUploadAttemptStage(attempt.stage),
    userMessage: attempt.userMessage ?? null,
    retryable: attempt.retryable ?? null,
    queuedAt: attempt.queuedAt ?? null,
    processingStartedAt: attempt.processingStartedAt ?? null,
    failedAt: attempt.failedAt ?? null,
    completedAt: attempt.completedAt ?? null,
    failureMessage: attempt.failureMessage ?? null,
    materialId: attempt.materialId ?? null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

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
      "/api/learning/topics/[topicId]/material-upload-attempts",
    );
  }
}
