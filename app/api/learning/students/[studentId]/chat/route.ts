import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import {
  answerTeacherStudentQuestion,
  hydrateStudentLearningEvidence,
} from "@/lib/learning/evidence";
import { resolveTeacherStudentAccess } from "@/lib/learning/teacher-route-access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { mapSessionAuthError } from "@/lib/route-auth-error";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { getMessageText } from "@/lib/chat-message-text";

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(z.record(z.string(), z.unknown())).optional(),
});

const requestSchema = z.object({
  question: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(chatMessageSchema).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;
    const body = requestSchema.parse(await request.json());

    const accessResult = await resolveTeacherStudentAccess({
      teacherUserId: session.user.id,
      classroomStudentId: studentId,
    });

    if (accessResult.error === "NOT_FOUND") {
      return apiError("NOT_FOUND", "Student not found");
    }

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const { membership } = accessResult;

    const latestUserMessage = [...(body.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
    const question = body.question?.trim() || getMessageText(latestUserMessage);

    if (!question) {
      return apiError("VALIDATION_ERROR", "No teacher question to process");
    }

    await hydrateStudentLearningEvidence({
      classroomStudentId: membership.id,
      studentUserId: membership.userId ?? null,
    });

    const answer = await answerTeacherStudentQuestion({
      classroomStudentId: membership.id,
      studentUserId: membership.userId ?? null,
      studentName: membership.fullName,
      question,
      language: normalizeAppLocale(
        body.language ?? membership.classroom.defaultContentLocale,
      ),
    });

    return NextResponse.json({
      success: true,
      data: answer,
    });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;

    return handleLearningRouteError(error, "Failed to answer teacher question", "/api/learning/students/[studentId]/chat");
  }
}
