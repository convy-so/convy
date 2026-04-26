import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { learningSessions, expertRuntimeModels } from "@/db/schema/learning";

import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { resolveTeacherExpertAnchor } from "@/lib/learning/expert-access";
import {
  createExpertReviewCase,
  listExpertReviewCases,
} from "@/lib/learning/storage";

const createReviewCaseSchema = z.object({
  topicId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  classroomStudentId: z.string().nullable().optional(),
  interactionId: z.string().nullable().optional(),
  reviewType: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  tutorFailureSummary: z.string().min(1),
  expertCorrection: z.string().min(1),
  reusableSignal: z.boolean().default(true),
  relevanceScope: z.enum(["general", "framework_specific"]).default("general"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);

    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get("topicId");
    const sessionId = searchParams.get("sessionId");

    const reviewCases = await listExpertReviewCases({
      teacherUserId: session.user.id,
      topicId,
      sessionId,
    });

    return NextResponse.json({ success: true, data: reviewCases });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load review cases" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const body = createReviewCaseSchema.parse(await request.json());
    const anchor = await resolveTeacherExpertAnchor(session.user.id, body);
    if (!anchor) {
      return NextResponse.json(
        { error: "A teacher-owned topic, student, session, or interaction is required." },
        { status: 404 },
      );
    }

    let frameworkVersionId: string | null = null;
    if (body.relevanceScope === "framework_specific" && anchor.sessionId) {
      const sessionRecord = await getDb().query.learningSessions.findFirst({
        where: eq(learningSessions.id, anchor.sessionId),
      });

      const runtimeModelId = sessionRecord?.state?.runtimeModelId;
      if (runtimeModelId) {
        const runtimeModel = await getDb().query.expertRuntimeModels.findFirst({
          where: eq(expertRuntimeModels.id, runtimeModelId),
        });
        if (runtimeModel) {
          frameworkVersionId = runtimeModel.frameworkVersionId;
        }
      }
    }

    const created = await createExpertReviewCase({
      reviewCase: {
        id: nanoid(),
        topicId: anchor.topicId,
        sessionId: anchor.sessionId,
        classroomStudentId: anchor.classroomStudentId,
        interactionId: anchor.interactionId,
        frameworkVersionId,
        relevanceScope: body.relevanceScope,
        reviewType: body.reviewType,
        priority: body.priority,
        tutorFailureSummary: body.tutorFailureSummary,
        expertCorrection: body.expertCorrection,
        reusableSignal: body.reusableSignal,
        status: "open",
        metadata: body.metadata,
        createdByUserId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Validation error" }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save review case" },
      { status: 400 },
    );
  }
}
