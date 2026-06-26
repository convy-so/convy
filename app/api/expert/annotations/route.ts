import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { studentSessions } from "@/shared/db/schema/tutoring";

import { requireExpertSession } from "@/features/tutoring/server/expert-route-guard";
import { resolveExpertReviewAnchor } from "@/features/tutoring/server/expert-access";
import {
  createExpertReviewCase,
  listExpertReviewCases,
  maybeCreateDraftCrystallizationFromReviewCases,
} from "@/features/tutoring/public-server";
import { apiError } from "@/shared/http/api-error";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

const createReviewCaseSchema = z.object({
  lessonId: z.string().nullable().optional(),
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
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lessonId");
    const sessionId = searchParams.get("sessionId");

    const reviewCases = await listExpertReviewCases({
      lessonId,
      sessionId,
    });

    return NextResponse.json({ success: true, data: reviewCases });
  } catch (error) {
    return handleTutoringRouteError(
      error,
      "Failed to load review cases",
      "expert-annotations:get",
    );
  }
}

export async function POST(request: Request) {
  try {
    const expert = await requireExpertSession();
    if ("error" in expert) return expert.error;
    const { session } = expert;
    const body = createReviewCaseSchema.parse(await request.json());
    const anchor = await resolveExpertReviewAnchor(body);
    if (!anchor) {
      return apiError(
        "NOT_FOUND",
        "A valid lesson, student, session, or interaction is required.",
      );
    }

    let frameworkId: string | null = null;
    if (body.relevanceScope === "framework_specific" && anchor.sessionId) {
      const sessionRecord = await getDb().query.studentSessions.findFirst({
        where: eq(studentSessions.id, anchor.sessionId),
      });

      frameworkId = sessionRecord?.state?.frameworkId ?? null;
    }

    const created = await createExpertReviewCase({
      reviewCase: {
        id: nanoid(),
        lessonId: anchor.lessonId,
        sessionId: anchor.sessionId,
        classroomStudentId: anchor.classroomStudentId,
        interactionId: anchor.interactionId,
        frameworkId,
        relevanceScope: body.relevanceScope,
        reviewType: body.reviewType,
        priority: body.priority,
        tutorFailureSummary: body.tutorFailureSummary,
        expertCorrection: body.expertCorrection,
        reusableSignal: body.reusableSignal,
        status: "open",
        metadata: {
          ...body.metadata,
        },
        createdByUserId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const autoCrystallization =
      anchor.lessonId && body.reusableSignal
        ? await maybeCreateDraftCrystallizationFromReviewCases({
            lessonId: anchor.lessonId,
            reviewType: body.reviewType,
            relevanceScope: body.relevanceScope,
            frameworkId,
          })
        : { created: false };

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
    return handleTutoringRouteError(error, "Failed to save review case", "expert-annotations:post");
  }
}


