import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { learningTopics, topicMaterials } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
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
import { getClientIP, uploadRateLimiter } from "@/lib/ratelimit";

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
    const clientIP = getClientIP(request);
    const rateLimitResult = await uploadRateLimiter.limit(clientIP);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimitResult.reset },
        { status: 429 },
      );
    }

    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load materials" },
      { status: 400 },
    );
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
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

    const extractedText = await extractLearningMaterialText({
      buffer,
      filename: file.name,
      mimeType,
    });

    const analysis = await analyzeLearningMaterial({
      topicTitle: topic.title,
      topicDescription: topic.description,
      learningOutcomes: topic.learningOutcomes,
      materialText: extractedText,
    });

    const groundingSummary = await generateMaterialGroundingSummary({
      topicTitle: topic.title,
      materialText: extractedText,
    });

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
        extractionStatus: "completed",
        indexingStatus: "completed",
        extractedText,
        analysis: {
          ...analysis,
          groundingSummary,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await replaceLearningMaterialEmbeddings({
      topicId,
      materialId,
      content: extractedText,
      metadata: {
        title: material.title,
        mimeType,
      },
    });

    if (topic.classroom.organizationId) {
      await indexLearningMaterialEvidence({
        organizationId: topic.classroom.organizationId,
        topicId,
        materialId,
        title: material.title,
        description: material.description,
        mimeType,
        content: extractedText,
        language: topic.contentLocale,
      });
    }

    await getDb()
      .update(learningTopics)
      .set({
        lastMaterialSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, topicId));

    return NextResponse.json({
      success: true,
      data: {
        material,
        analysis,
        groundingSummary,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload material" },
      { status: 400 },
    );
  }
}
