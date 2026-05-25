import { and, eq, ne } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { topicMaterials } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { uploadLearningMaterial } from "@/lib/storage";
import {
  buildUploadAttemptFailure,
  createLearningMaterialUploadAttempt,
  getTeacherTopicOrNull,
  isMaterialAnalysisFailed,
  normalizeLearningMaterialUploadAttemptStage,
  normalizeDetectedLearningMaterialMime,
  updateLearningMaterialUploadAttempt,
} from "@/lib/learning/materials-route-service";
import { assertLearningMaterialFile } from "@/lib/security/uploads";
import { enqueueLearningMaterialProcessing } from "@/lib/queue";
import { publishClassroomRealtimeEvent } from "@/lib/realtime";

function getFileMetadata(formData: FormData, key: string, index: number) {
  return (
    String(formData.get(`${key}-${index}`) || "") ||
    String(formData.get(`${key}:${index}`) || "") ||
    String(formData.get(key) || "")
  );
}

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
  internalError?: string | null;
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
    internalError:
      process.env.NODE_ENV === "production" ? null : (attempt.internalError ?? null),
    materialId: attempt.materialId ?? null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const materials = await getDb().query.topicMaterials.findMany({
      where: and(
        eq(topicMaterials.topicId, topicId),
        ne(topicMaterials.extractionStatus, "failed"),
        ne(topicMaterials.indexingStatus, "failed"),
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: materials
        .filter((material) => !isMaterialAnalysisFailed(material.analysis))
        .map((material) => ({
          ...material,
          analysis: material.analysis ?? undefined,
        })),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load materials", "/api/learning/topics/[topicId]/materials");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const startedAt = Date.now();
  let topicIdForLog = "unknown";

  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    topicIdForLog = topicId;
    console.info("[learning-material-upload] start", {
      topicId,
      userId: session.user.id,
    });

    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const formData = await request.formData();
    const files = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((value): value is File => value instanceof File && value.size > 0);

    if (!files.length) return apiError("VALIDATION_ERROR", "File is required");

    const batchId = nanoid();
    const attempts = [];

    for (const [index, file] of files.entries()) {
      const attemptId = nanoid();
      const title = getFileMetadata(formData, "title", index);
      const description = getFileMetadata(formData, "description", index);
      let uploadedBucket: string | null = null;
      let uploadedPath: string | null = null;
      let mimeType: string | null = file.type || null;
      let attempt = await createLearningMaterialUploadAttempt({
        id: attemptId,
        batchId,
        topicId,
        uploadedByUserId: session.user.id,
        fileName: file.name,
        title,
        description,
        mimeType,
        sizeBytes: file.size,
        status: "processing",
        stage: "upload",
        processingStartedAt: new Date(),
      });

      try {
        console.info("[learning-material-upload] file received", {
          topicId,
          batchId,
          attemptId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        assertLearningMaterialFile(file);
        const buffer = Buffer.from(await file.arrayBuffer());
        const detected = await fileTypeFromBuffer(buffer);
        mimeType = normalizeDetectedLearningMaterialMime({
          filename: file.name,
          fileType: file.type,
          detectedMime: detected?.mime,
        });
        assertLearningMaterialFile({ name: file.name, size: file.size, type: mimeType });

        const uploaded = await uploadLearningMaterial(
          buffer,
          topicId,
          attemptId,
          mimeType,
          file.name,
        );
        uploadedBucket = uploaded.bucket;
        uploadedPath = uploaded.path;
        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: topic.classroomId,
            topicId,
            batchId,
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploaded.bucket,
            storagePath: uploaded.path,
            userMessage: null,
            internalError: null,
            errorCode: null,
            retryable: null,
            failedAt: null,
            completedAt: null,
            failureMessage: null,
          })) ?? attempt;

        await enqueueLearningMaterialProcessing({
          attemptId,
          topicId,
          classroomId: topic.classroomId,
          userId: session.user.id,
          storagePath: uploaded.path,
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          title: title || null,
          description: description || null,
        });

        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: topic.classroomId,
            topicId,
            batchId,
            status: "queued",
            stage: "extraction",
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploaded.bucket,
            storagePath: uploaded.path,
            queuedAt: new Date(),
            userMessage: null,
            internalError: null,
            errorCode: null,
            retryable: null,
            failedAt: null,
            completedAt: null,
            failureMessage: null,
          })) ?? attempt;

        attempts.push(attempt);
      } catch (error) {
        const failure = buildUploadAttemptFailure("upload", error);
        attempt =
          (await updateLearningMaterialUploadAttempt({
            attemptId,
            classroomId: topic.classroomId,
            topicId,
            batchId,
            status: "failed",
            stage: "upload",
            mimeType,
            sizeBytes: file.size,
            storageBucket: uploadedBucket,
            storagePath: uploadedPath,
            userMessage: failure.userMessage,
            internalError: failure.internalError,
            errorCode: failure.errorCode,
            retryable: failure.retryable,
            failedAt: failure.failedAt,
            completedAt: null,
            failureMessage: failure.failureMessage,
          })) ?? attempt;
        if (attempt) attempts.push(attempt);
      }
    }

    await publishClassroomRealtimeEvent(topic.classroomId, {
      type: "learning_material_upload_updated",
      topicId,
      batchId,
      attemptIds: attempts.map((attempt) => attempt.id),
    });

    console.info("[learning-material-upload] batch queued", {
      topicId,
      batchId,
      attemptCount: attempts.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      data: {
        batchId,
        attempts: attempts.map(serializeUploadAttempt),
      },
    });
  } catch (error) {
    console.error("[learning-material-upload] failed", {
      topicId: topicIdForLog,
      durationMs: Date.now() - startedAt,
      error,
    });

    return handleLearningRouteError(error, "Failed to upload material", "/api/learning/topics/[topicId]/materials");
  }
}
