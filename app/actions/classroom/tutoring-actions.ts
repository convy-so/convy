"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { teacherStudentChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  ActionError,
  type ActionResult,
  validateInput,
  withErrorHandling,
} from "@/lib/action-wrapper";
import { getMessageText } from "@/lib/chat-message-text";
import {
  answerTeacherStudentQuestion,
  hydrateStudentLearningEvidence,
} from "@/lib/learning/evidence";
import { getStudentTutoringAccess } from "@/lib/learning/access";
import { contentScopeService } from "@/lib/learning/content-scope-service";
import {
  classifyOutOfSessionQuestion,
  generateOutOfSessionReply,
} from "@/lib/learning/out-of-session";
import { logLearningInteraction } from "@/lib/learning/storage";
import { finalizeTutoringSession } from "@/lib/learning/tutoring-session-lifecycle";
import {
  resolveStudentTutoringContext,
  resolveStudentTutoringSessionById,
} from "@/lib/learning/tutoring-route-orchestrator";
import { resolveTeacherStudentAccess } from "@/lib/learning/teacher-route-access";
import type { GradeBand } from "@/lib/learning/types";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";

import { revalidateLearningUi } from "./shared";

const completeTutoringSessionSchema = z.object({
  topicId: z.string().min(1),
  sessionId: z.string().min(1),
  language: z.string().optional(),
});

const outOfSessionQuestionSchema = z.object({
  topicId: z.string().min(1),
  message: z.string().trim().min(1),
  language: z.string().optional(),
});

const teacherChatMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(z.record(z.string(), z.unknown())).optional(),
  id: z.string().optional(),
  createdAt: z.string().optional(),
});

const teacherStudentQuestionSchema = z.object({
  classroomStudentId: z.string().min(1),
  question: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(teacherChatMessageSchema).optional(),
});

const saveTeacherStudentChatSessionSchema = z.object({
  classroomStudentId: z.string().min(1),
  sessionId: z.string().optional(),
  title: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(teacherChatMessageSchema),
});

function deriveTeacherChatTitle(
  messages: Array<z.infer<typeof teacherChatMessageSchema>>,
) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New Chat";

  if (typeof firstUser.content === "string" && firstUser.content.trim()) {
    return firstUser.content.trim().slice(0, 72);
  }

  const partText = firstUser.parts
    ?.flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("")
    .trim();

  return partText?.slice(0, 72) || "New Chat";
}

export async function completeTutoringSessionAction(
  input: unknown,
): Promise<
  ActionResult<{
    sessionId: string;
    status: string;
    reportQueued?: boolean;
    alreadyCompleted?: boolean;
  }>
> {
  return withErrorHandling<{
    sessionId: string;
    status: string;
    reportQueued: boolean;
    alreadyCompleted: boolean;
  }>(async () => {
    const auth = await getVerifiedSession();
    const body = validateInput(input, completeTutoringSessionSchema);
    const { access } = await resolveStudentTutoringContext({
      userId: auth.user.id,
      topicId: body.topicId,
    });

    if (!access) {
      throw new ActionError("Unauthorized", "UNAUTHORIZED");
    }

    const tutoringSession = await resolveStudentTutoringSessionById({
      sessionId: body.sessionId,
      topicId: body.topicId,
      classroomStudentId: access.classroomStudent.id,
    });

    if (!tutoringSession) {
      throw new ActionError("Tutoring session not found", "NOT_FOUND");
    }

    if (tutoringSession.sessionStatus !== "active") {
      return {
        success: true,
        data: {
          sessionId: tutoringSession.id,
          status: tutoringSession.sessionStatus,
          reportQueued: false,
          alreadyCompleted: true,
        },
      };
    }

    const state = learningSessionStateSchema.parse(tutoringSession.state ?? {});
    const studyLanguage = normalizeAppLocale(
      body.language ?? auth.user.uiLocale ?? auth.user.preferredLanguage ?? "en",
    );

    await finalizeTutoringSession({
      sessionId: tutoringSession.id,
      topicId: body.topicId,
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

    revalidateLearningUi();

    return {
      success: true,
      data: {
        sessionId: tutoringSession.id,
        status: "completed",
        alreadyCompleted: false,
        reportQueued: true,
      },
    };
  }, "completeTutoringSessionAction");
}

export async function askOutOfSessionQuestionAction(
  input: unknown,
): Promise<
  ActionResult<{
    classification: "in_scope" | "borderline" | "off_scope";
    response: string;
  }>
> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, outOfSessionQuestionSchema);
    const access = await getStudentTutoringAccess(session.user.id, body.topicId);

    if (!access) {
      throw new ActionError("Unauthorized", "UNAUTHORIZED");
    }

    const classification = await classifyOutOfSessionQuestion({
      topicTitle: access.topic.title,
      topicDescription: access.topic.description,
      learningOutcomes: access.topic.learningOutcomes,
      question: body.message,
    });

    const contentScope = await contentScopeService.buildScopeFromPack({
      topicId: body.topicId,
      sourceBoundary: access.topic.sourceBoundary ?? {
        teacherSummary: "",
        scopeNotes: [],
        notationNotes: [],
        rigorNotes: [],
        allowedMaterialIds: [],
      },
      contentLocale: normalizeAppLocale(access.topic.contentLocale),
    });

    const response = await generateOutOfSessionReply({
      classification: classification.classification,
      topicTitle: access.topic.title,
      learningOutcomes: access.topic.learningOutcomes,
      gradeBand: access.topic.classroom.gradeBand as GradeBand,
      studentProfile: access.classroomStudent.interestProfile.profile,
      question: body.message,
      retrievedContext: contentScope.retrievedContext,
      language: normalizeAppLocale(body.language ?? access.topic.contentLocale),
    });

    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId: body.topicId,
      role: "user",
      interactionType: "out_of_session_question",
      content: body.message,
      metadata: {
        relevance: classification.classification,
        rationale: classification.rationale,
      },
    });

    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId: body.topicId,
      role: "assistant",
      interactionType: "agent_answer",
      content: response,
      metadata: {
        relevance: classification.classification,
        retrievedContextCount: contentScope.retrievedContext.length,
      },
    });

    revalidateLearningUi();

    return {
      success: true,
      data: {
        classification: classification.classification,
        response,
      },
    };
  }, "askOutOfSessionQuestionAction");
}

export async function answerTeacherStudentQuestionAction(
  input: unknown,
): Promise<
  ActionResult<{
    answer: string;
    evidenceHighlights: string[];
  }>
> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, teacherStudentQuestionSchema);

    const accessResult = await resolveTeacherStudentAccess({
      teacherUserId: session.user.id,
      classroomStudentId: body.classroomStudentId,
    });

    if (accessResult.error === "NOT_FOUND") {
      throw new ActionError("Student not found", "NOT_FOUND");
    }

    if (accessResult.error === "UNAUTHORIZED") {
      throw new ActionError("Unauthorized", "UNAUTHORIZED");
    }

    const { membership } = accessResult;
    const latestUserMessage = [...(body.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
    const question = body.question?.trim() || getMessageText(latestUserMessage);

    if (!question) {
      throw new ActionError("No teacher question to process", "VALIDATION_ERROR");
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

    revalidateLearningUi();
    return { success: true, data: answer };
  }, "answerTeacherStudentQuestionAction");
}

export async function saveTeacherStudentChatSessionAction(
  input: unknown,
): Promise<ActionResult<{ id: string; title: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, saveTeacherStudentChatSessionSchema);

    const accessResult = await resolveTeacherStudentAccess({
      teacherUserId: session.user.id,
      classroomStudentId: body.classroomStudentId,
    });

    if (accessResult.error === "NOT_FOUND") {
      throw new ActionError("Student not found", "NOT_FOUND");
    }

    if (accessResult.error === "UNAUTHORIZED") {
      throw new ActionError("Unauthorized", "UNAUTHORIZED");
    }

    const { membership } = accessResult;
    const title = body.title?.trim() || deriveTeacherChatTitle(body.messages);
    const language = normalizeAppLocale(
      body.language ?? membership.classroom.defaultContentLocale,
    );

    if (body.sessionId) {
      const [updated] = await getDb()
        .update(teacherStudentChatSessions)
        .set({
          title,
          language,
          messages: body.messages,
        })
        .where(
          and(
            eq(teacherStudentChatSessions.id, body.sessionId),
            eq(teacherStudentChatSessions.classroomStudentId, body.classroomStudentId),
            eq(teacherStudentChatSessions.teacherUserId, session.user.id),
          ),
        )
        .returning({
          id: teacherStudentChatSessions.id,
          title: teacherStudentChatSessions.title,
        });

      if (!updated) {
        throw new ActionError("Session not found", "NOT_FOUND");
      }

      revalidateLearningUi();
      return { success: true, data: updated };
    }

    const [created] = await getDb()
      .insert(teacherStudentChatSessions)
      .values({
        id: `learn_chat_${crypto.randomUUID()}`,
        classroomStudentId: body.classroomStudentId,
        teacherUserId: session.user.id,
        language,
        title,
        messages: body.messages,
      })
      .returning({
        id: teacherStudentChatSessions.id,
        title: teacherStudentChatSessions.title,
      });

    revalidateLearningUi();
    return { success: true, data: created };
  }, "saveTeacherStudentChatSessionAction");
}
