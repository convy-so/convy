import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { topicMaterials } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { createSignedLearningMaterialUrl } from "@/lib/storage";

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
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const topic = await getTeacherTopicAccess(session.user.id, material.topicId);
    if (!topic) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!material.storagePath) {
      return NextResponse.json({ error: "Material storage path missing" }, { status: 404 });
    }

    const signedUrl = await createSignedLearningMaterialUrl(material.storagePath);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof Error &&
      error.name === "GDPR_WORKSPACE_PRIVACY_INCOMPLETE"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to access material" }, { status: 500 });
  }
}

