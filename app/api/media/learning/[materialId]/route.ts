import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { topicMaterials } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherTopicAccess } from "@/features/tutoring/server/access";
import { createSignedLearningMaterialUrl } from "@/shared/infra/supabase-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { materialId } = await params;

    const material = await getDb().query.topicMaterials.findFirst({
      where: eq(topicMaterials.id, materialId),
    });

    if (!material) {
      return apiError("NOT_FOUND", "Material not found");
    }

    const topic = await getTeacherTopicAccess(session.user.id, material.topicId);
    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    if (!material.storagePath) {
      return apiError("NOT_FOUND", "Material storage path missing");
    }

    const signedUrl = await createSignedLearningMaterialUrl(material.storagePath);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(error, "Failed to access material", "/api/media/learning/[materialId]");
  }
}

