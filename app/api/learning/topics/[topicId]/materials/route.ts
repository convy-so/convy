import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { topicMaterials } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { getRateLimitKey, uploadRateLimiter } from "@/lib/ratelimit";
import {
  createTopicMaterial,
  enrichMaterialContent,
  getTeacherTopicOrNull,
  indexMaterialAndSyncBoundary,
} from "@/lib/learning/materials-route-service";

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
    if (!rateLimitResult.success) return apiError("RATE_LIMITED", "Rate limit exceeded");

    const { topicId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const materials = await getDb().query.topicMaterials.findMany({
      where: eq(topicMaterials.topicId, topicId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({ success: true, data: materials });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load materials", "/api/learning/topics/[topicId]/materials");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    if (!(file instanceof File)) return apiError("VALIDATION_ERROR", "File is required");

    const { material, buffer, mimeType } = await createTopicMaterial({
      topicId,
      userId: session.user.id,
      topic,
      file,
      title,
      description,
    });

    const { extractedText, analysis, groundingSummary } = await enrichMaterialContent({
      materialId: material.id,
      fileName: file.name,
      mimeType,
      buffer,
      topic,
    });

    try {
      await indexMaterialAndSyncBoundary({
        topicId,
        materialId: material.id,
        material,
        mimeType,
        extractedText,
        analysis,
        topic,
      });
    } catch (error) {
      await getDb().update(topicMaterials).set({
        indexingStatus: "failed",
        indexingError: error instanceof Error ? error.message : "Material indexing failed",
        updatedAt: new Date(),
      }).where(eq(topicMaterials.id, material.id));

      return NextResponse.json({
        success: true,
        data: {
          material: {
            ...material,
            extractionStatus: "completed",
            indexingStatus: "failed",
            extractedText,
            analysis: { ...analysis, groundingSummary },
          },
          analysis,
          groundingSummary,
          warning: error instanceof Error ? error.message : "Material uploaded, but indexing did not complete.",
        },
      });
    }

    return NextResponse.json({ success: true, data: { material, analysis, groundingSummary } });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to upload material", "/api/learning/topics/[topicId]/materials");
  }
}
