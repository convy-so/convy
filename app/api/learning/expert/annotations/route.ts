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
  maybeCreateDraftCrystallizationFromReviewCases,
} from "@/lib/learning/storage";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

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
    return apiUnhandledError(
      error,
      "Failed to load review cases",
      "expert-annotations:get",
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
      return apiError(
        "NOT_FOUND",
        "A teacher-owned topic, student, session, or interaction is required.",
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

    const autoCrystallization =
      anchor.topicId && body.reusableSignal
        ? await maybeCreateDraftCrystallizationFromReviewCases({
            topicId: anchor.topicId,
            reviewType: body.reviewType,
            relevanceScope: body.relevanceScope,
            frameworkVersionId,
          })
        : { created: false as const };

    return NextResponse.json({
      success: true,
      data: created,
      autoCrystallization,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(
        "VALIDATION_ERROR",
        error.errors[0]?.message ?? "Validation error",
      );
    }
    return apiUnhandledError(error, "Failed to save review case", "expert-annotations:post");
  }
}
