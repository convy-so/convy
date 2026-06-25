"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/shared/db";
import { teacherStudentChatSessions } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  ActionError,
  type ActionResult,
  validateInput,
  withErrorHandling,
} from "@/shared/http/action-result";
import { getMessageText } from "@/shared/chat/chat-message-text";
import {
  answerTeacherStudentQuestion,
  hydrateStudentLearningEvidence,
} from "@/features/tutoring/server/evidence";
import { selectGroundingUnitsForPrompt } from "@/features/tutoring/server/grounding-units";
import { renderGroundingUnits } from "@/features/tutoring/server/prompt-serializers";
import { getStudentTutoringAccess } from "@/features/tutoring/server/access";
import { contentScopeService } from "@/features/tutoring/server/content-scope-service";
import {
  classifyOutOfSessionQuestion,
  generateOutOfSessionReply,
} from "@/features/tutoring/server/out-of-session";
import { logLearningInteraction } from "@/features/tutoring/public-server";
import { finalizeTutoringSession } from "@/features/tutoring/server/tutoring-session-lifecycle";
import {
  resolveStudentTutoringContext,
  resolveStudentTutoringSessionById,
} from "@/features/tutoring/server/tutoring-route-orchestrator";
import { resolveTeacherStudentAccess } from "@/features/tutoring/server/teacher-route-access";
import type { GradeBand } from "@/features/tutoring/public-server";
import { learningSessionStateSchema } from "@/features/tutoring/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  LEARNING_DEFAULTS,
  LEARNING_LIMITS,
  LEARNING_NUMERIC_DEFAULTS,
  LEARNING_STATUS,
  OUT_OF_SESSION_CLASSIFICATION_VALUES,
  TUTORING_COMPLETION_REASON,
} from "@/shared/learning/constants";
import { requireValue } from "@/shared/utils/collections";

import { revalidateLearningUi } from "./action-access";

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
  if (!firstUser) return LEARNING_DEFAULTS.chatTitle;

  if (typeof firstUser.content === "string" && firstUser.content.trim()) {
    return firstUser.content
      .trim()
      .slice(0, LEARNING_LIMITS.teacherChatTitlePreviewLength);
  }

  const partText = firstUser.parts
    ?.flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("")
    .trim();

  return (
    partText?.slice(0, LEARNING_LIMITS.teacherChatTitlePreviewLength) ||
    LEARNING_DEFAULTS.chatTitle
  );
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

    if (tutoringSession.sessionStatus !== LEARNING_STATUS.sessionActive) {
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
      expectedStateVersion:
        tutoringSession.stateVersion ?? LEARNING_NUMERIC_DEFAULTS.initialVersion,
      state,
      reason: TUTORING_COMPLETION_REASON.STUDENT_FINISHED,
    });

    revalidateLearningUi();

    return {
      success: true,
      data: {
        sessionId: tutoringSession.id,
        status: LEARNING_STATUS.sessionCompleted,
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
    classification: (typeof OUT_OF_SESSION_CLASSIFICATION_VALUES)[number];
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
      retrievedContext: renderGroundingUnits(
        selectGroundingUnitsForPrompt({
          contentScope,
          query: body.message,
          recentSummary: access.topic.title,
          budgetTokens: LEARNING_LIMITS.outOfSessionGroundingBudgetTokens,
          maxUnits: LEARNING_LIMITS.outOfSessionGroundingMaxUnits,
        }),
      ),
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
    const createdSession = requireValue(
      created,
      `Failed to create teacher chat session for student ${body.classroomStudentId}`,
    );

    revalidateLearningUi();
    return { success: true, data: createdSession };
  }, "saveTeacherStudentChatSessionAction");
}
