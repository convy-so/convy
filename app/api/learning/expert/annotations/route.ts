import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import {
  createLearningExpertAnnotation,
  listLearningExpertAnnotations,
} from "@/lib/learning/storage";
import { expertAnnotationSchema } from "@/lib/learning/expert-types";
import { getTeachingContext } from "@/lib/teaching-context";

const createAnnotationSchema = expertAnnotationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdByUserId: true,
});

export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const context = await getTeachingContext();
    if (!context.organizationId) {
      return NextResponse.json({ error: "Workspace required" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get("topicId");
    const sessionId = searchParams.get("sessionId");

    const annotations = await listLearningExpertAnnotations({
      organizationId: context.organizationId,
      topicId,
      sessionId,
    });

    return NextResponse.json({ success: true, data: annotations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load annotations" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const context = await getTeachingContext();
    if (!context.organizationId) {
      return NextResponse.json({ error: "Workspace required" }, { status: 400 });
    }

    const body = createAnnotationSchema.parse(await request.json());
    const reviewQueueKey =
      typeof body.metadata?.reviewQueueKey === "string"
        ? body.metadata.reviewQueueKey
        : null;
    if (reviewQueueKey) {
      const existing = await listLearningExpertAnnotations({
        organizationId: context.organizationId,
      });
      const existingReviewed = existing.find(
        (annotation) =>
          annotation.status === "reviewed" &&
          typeof annotation.metadata?.reviewQueueKey === "string" &&
          annotation.metadata.reviewQueueKey === reviewQueueKey,
      );
      if (existingReviewed) {
        return NextResponse.json({ success: true, data: existingReviewed });
      }
    }

    const now = new Date().toISOString();
    const annotation = expertAnnotationSchema.parse({
      ...body,
      id: nanoid(),
      organizationId: context.organizationId,
      createdByUserId: session.user.id,
      createdAt: now,
      updatedAt: now,
    });

    const created = await createLearningExpertAnnotation({ annotation });
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save annotation" },
      { status: 400 },
    );
  }
}
