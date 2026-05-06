import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getStudentTopicAccess } from "@/lib/learning/access";
import { finalizeTutoringSession } from "@/lib/learning/tutoring-session-lifecycle";
import { getLearningSessionById } from "@/lib/learning/storage";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";

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
    const access = await getStudentTopicAccess(auth.user.id, topicId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const body = requestSchema.parse(await request.json());
    const tutoringSession = await getLearningSessionById(body.sessionId);

    if (
      !tutoringSession ||
      tutoringSession.sessionType !== "tutoring" ||
      tutoringSession.topicId !== topicId ||
      tutoringSession.classroomStudentId !== access.classroomStudent.id
    ) {
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
    return apiUnhandledError(error, "Failed to complete tutoring session", "/api/learning/topics/[topicId]/chat/complete");
  }
}
