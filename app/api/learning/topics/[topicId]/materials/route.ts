import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { learningTopics, topicMaterials } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import {
  analyzeLearningMaterial,
  extractLearningMaterialText,
  generateMaterialGroundingSummary,
} from "@/lib/learning/materials";
import { indexLearningMaterialEvidence } from "@/lib/learning/evidence";
import { buildLearningMaterialAccessPath } from "@/lib/media-access";
import { replaceLearningMaterialEmbeddings } from "@/lib/learning/rag";
import { uploadLearningMaterial } from "@/lib/storage";
import { assertLearningMaterialFile } from "@/lib/security/uploads";
import { getRateLimitKey, uploadRateLimiter } from "@/lib/ratelimit";
import { topicSourceBoundarySchema } from "@/lib/learning/types";

function inferMaterialKind(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "document";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const rateLimitResult = await uploadRateLimiter.limit(
      getRateLimitKey(request, {
        userId: session.user.id,
        scope: "learning-materials:get",
      }),
    );
    if (!rateLimitResult.success) {
      return apiError("RATE_LIMITED", "Rate limit exceeded");
    }

    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const materials = await getDb().query.topicMaterials.findMany({
      where: eq(topicMaterials.topicId, topicId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: materials,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load materials", "/api/learning/topics/[topicId]/materials");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");

    if (!(file instanceof File)) {
      return apiError("VALIDATION_ERROR", "File is required");
    }
    assertLearningMaterialFile(file);

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    const mimeType = detected?.mime || file.type || "application/octet-stream";
    assertLearningMaterialFile({
      name: file.name,
      size: file.size,
      type: mimeType,
    });
    const materialId = nanoid();

    const uploaded = await uploadLearningMaterial(
      buffer,
      topicId,
      materialId,
      mimeType,
      file.name,
    );

    const [material] = await getDb()
      .insert(topicMaterials)
      .values({
        id: materialId,
        topicId,
        uploadedByUserId: session.user.id,
        title: title.trim() || file.name,
        description: description.trim() || null,
        materialKind: inferMaterialKind(mimeType),
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        publicUrl: buildLearningMaterialAccessPath(materialId),
        mimeType,
        sizeBytes: file.size,
        extractionStatus: "processing",
        indexingStatus: "pending",
        extractedText: null,
        analysis: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    let extractedText = "";
    let analysis: Record<string, unknown> = {};
    let groundingSummary = "";

    try {
      extractedText = await extractLearningMaterialText({
        buffer,
        filename: file.name,
        mimeType,
      });

      analysis = await analyzeLearningMaterial({
        topicTitle: topic.title,
        topicDescription: topic.description,
        learningOutcomes: topic.learningOutcomes,
        materialText: extractedText,
      });

      groundingSummary = await generateMaterialGroundingSummary({
        topicTitle: topic.title,
        materialText: extractedText,
      });

      await getDb()
        .update(topicMaterials)
        .set({
          extractionStatus: "completed",
          extractionError: null,
          extractedText,
          analysis: {
            ...analysis,
            groundingSummary,
          },
          indexingStatus: "processing",
          indexingError: null,
          updatedAt: new Date(),
        })
        .where(eq(topicMaterials.id, materialId));
    } catch (error) {
      await getDb()
        .update(topicMaterials)
        .set({
          extractionStatus: "failed",
          extractionError:
            error instanceof Error ? error.message : "Material extraction failed",
          indexingStatus: "failed",
          indexingError: "Indexing skipped because extraction failed.",
          updatedAt: new Date(),
        })
        .where(eq(topicMaterials.id, materialId));

      throw error;
    }

    try {
      await replaceLearningMaterialEmbeddings({
        classroomId: topic.classroomId,
        topicId,
        materialId,
        content: extractedText,
        topicTitle: topic.title,
        materialTitle: material.title,
        materialKind: material.materialKind,
        subjectKey: topic.subjectKey,
        gradeBand: topic.classroom.gradeBand,
        contentLocale: topic.contentLocale,
        sourceUpdatedAt: material.updatedAt,
        metadata: {
          title: material.title,
          mimeType,
          topicTitle: topic.title,
          subjectKey: topic.subjectKey,
          gradeBand: topic.classroom.gradeBand,
          locale: topic.contentLocale,
        },
      });

      await indexLearningMaterialEvidence({
        classroomId: topic.classroomId,
        topicId,
        materialId,
        topicTitle: topic.title,
        title: material.title,
        description: material.description,
        mimeType,
        content: extractedText,
        subjectKey: topic.subjectKey,
        gradeBand: topic.classroom.gradeBand,
        language: topic.contentLocale,
        sourceUpdatedAt: material.updatedAt,
      });

      const currentTopic = await getDb().query.learningTopics.findFirst({
        where: eq(learningTopics.id, topicId),
        columns: { sourceBoundary: true },
      });

      const existingBoundary = topicSourceBoundarySchema.parse(
        currentTopic?.sourceBoundary ?? {},
      );

      const updatedBoundary = topicSourceBoundarySchema.parse({
        ...existingBoundary,
        rigorNotes: Array.from(
          new Set([
            ...(existingBoundary.rigorNotes || []),
            ...((analysis.rigorNotes as string[]) || []),
          ]),
        ),
        notationNotes: Array.from(
          new Set([
            ...(existingBoundary.notationNotes || []),
            ...((analysis.notationNotes as string[]) || []),
          ]),
        ),
        scopeNotes: Array.from(
          new Set([
            ...(existingBoundary.scopeNotes || []),
            ...((analysis.scopeNotes as string[]) || []),
          ]),
        ),
      });

      await Promise.all([
        getDb()
          .update(topicMaterials)
          .set({
            indexingStatus: "completed",
            indexingError: null,
            updatedAt: new Date(),
          })
          .where(eq(topicMaterials.id, materialId)),
        getDb()
          .update(learningTopics)
          .set({
            sourceBoundary: updatedBoundary,
            lastMaterialSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(learningTopics.id, topicId)),
      ]);
    } catch (error) {
      await getDb()
        .update(topicMaterials)
        .set({
          indexingStatus: "failed",
          indexingError:
            error instanceof Error ? error.message : "Material indexing failed",
          updatedAt: new Date(),
        })
        .where(eq(topicMaterials.id, materialId));

      return NextResponse.json({
        success: true,
        data: {
          material: {
            ...material,
            extractionStatus: "completed",
            indexingStatus: "failed",
            extractedText,
            analysis: {
              ...analysis,
              groundingSummary,
            },
          },
          analysis,
          groundingSummary,
          warning:
            error instanceof Error
              ? error.message
              : "Material uploaded, but indexing did not complete.",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        material,
        analysis,
        groundingSummary,
      },
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to upload material", "/api/learning/topics/[topicId]/materials");
  }
}
