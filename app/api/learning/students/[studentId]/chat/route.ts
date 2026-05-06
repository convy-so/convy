import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  answerTeacherStudentQuestion,
  hydrateStudentLearningEvidence,
} from "@/lib/learning/evidence";
import { getTeacherClassroomAccess } from "@/lib/learning/access";
import { normalizeAppLocale } from "@/lib/i18n/config";

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

function getMessageText(
  message: z.infer<typeof chatMessageSchema> | undefined,
) {
  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (!Array.isArray(message?.parts)) {
    return "";
  }

  return message.parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("")
    .trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;
    const body = requestSchema.parse(await request.json());

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, studentId),
      with: {
        classroom: true,
      },
    });

    if (!membership) {
      return apiError("NOT_FOUND", "Student not found");
    }

    const access = await getTeacherClassroomAccess(
      session.user.id,
      membership.classroomId,
    );

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

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
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }

    return apiUnhandledError(error, "Failed to answer teacher question", "/api/learning/students/[studentId]/chat");
  }
}
