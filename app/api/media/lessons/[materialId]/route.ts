import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { getDb } from "@/shared/db";
import { lessonMaterials } from "@/shared/db/schema";
import { createSignedLessonMaterialUrl } from "@/shared/infra/supabase-storage";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { materialId } = await params;

    const material = await getDb().query.lessonMaterials.findFirst({
      where: eq(lessonMaterials.id, materialId),
    });

    if (!material) {
      return apiError("NOT_FOUND", "Material not found");
    }

    const lesson = await getTeacherLessonAccess(session.user.id, material.lessonId);
    if (!lesson) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    if (!material.storagePath) {
      return apiError("NOT_FOUND", "Material storage path missing");
    }

    const signedUrl = await createSignedLessonMaterialUrl(material.storagePath);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }

    return apiUnhandledError(
      error,
      "Failed to access material",
      "/api/media/lessons/[materialId]",
    );
  }
}
