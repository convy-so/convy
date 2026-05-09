import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import { finalizeTutoringSession } from "@/lib/learning/tutoring-session-lifecycle";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import {
  resolveStudentTutoringContext,
  resolveStudentTutoringSessionById,
} from "@/lib/learning/tutoring-route-orchestrator";

const requestSchema = z.object({
  sessionId: z.string().min(1),
  language: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const auth = await getVerifiedSession();
    const { topicId } = await params;
    const { access } = await resolveStudentTutoringContext({
      userId: auth.user.id,
      topicId,
    });

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const body = requestSchema.parse(await request.json());
    const tutoringSession = await resolveStudentTutoringSessionById({
      sessionId: body.sessionId,
      topicId,
      classroomStudentId: access.classroomStudent.id,
    });

    if (!tutoringSession) {
      return apiError("NOT_FOUND", "Tutoring session not found");
    }

    if (tutoringSession.sessionStatus !== "active") {
      return NextResponse.json({
        success: true,
        data: {
          sessionId: tutoringSession.id,
          status: tutoringSession.sessionStatus,
          alreadyCompleted: true,
        },
      });
    }

    const state = learningSessionStateSchema.parse(tutoringSession.state ?? {});
    const studyLanguage = normalizeAppLocale(
      body.language ?? auth.user.uiLocale ?? auth.user.preferredLanguage ?? "en",
    );

    await finalizeTutoringSession({
      sessionId: tutoringSession.id,
      topicId,
      classroomId: access.topic.classroomId,
      classroomStudentId: access.classroomStudent.id,
      studentUserId: auth.user.id,
      studentName: access.classroomStudent.fullName,
      topicTitle: access.topic.title,
      sourceLocale: access.topic.contentLocale ?? studyLanguage,
      summary: tutoringSession.summary ?? null,
      expectedStateVersion: tutoringSession.stateVersion ?? 1,
      state,
      reason: "student_finished",
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutoringSession.id,
        status: "completed",
        reportQueued: true,
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to complete tutoring session",
      "/api/learning/topics/[topicId]/chat/complete",
    );
  }
}
