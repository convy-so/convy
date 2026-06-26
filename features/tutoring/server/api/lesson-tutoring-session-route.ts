import { type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import { flashModel } from "@/shared/ai";
import {
  getActiveStudentSession,
  getLatestCompletedStudentSession,
  listStudentSessionMessages,
} from "@/features/tutoring/public-server";
import { studentSessionStateSchema } from "@/features/tutoring/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import { apiError } from "@/shared/http/api-error";
import {
  ensureTutoringSession,
  getStudentTutoringAccessFailureMessage,
  resolveStudyLanguage,
  resolveStudentTutoringContext,
} from "@/features/tutoring/server/tutoring-route-orchestrator";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";
import { getLatestUserText, prepareTutoringTurn } from "@/features/tutoring/server/tutoring-turn-preparation";
import { logUserTurn } from "@/features/tutoring/server/tutoring-turn-logging";
import { evaluateTutoringScope, maybeHandleScopeRedirect } from "@/features/tutoring/server/tutoring-chat-route-service";
import { finalizeTutoringTurn } from "@/features/tutoring/server/tutoring-turn-finalization";
import {
  logTutoringDebug,
  logTutoringError,
  summarizeTutoringMessages,
  summarizeTutoringText,
  createTutoringTimer,
} from "@/features/tutoring/public-server";
import {
  TUTORING_STATUS,
  STUDENT_TUTORING_ACCESS_REASON,
} from "@/shared/tutoring/constants";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  let lessonId = "unknown";
  const requestId = crypto.randomUUID();
  const timer = createTutoringTimer();
  try {
    const session = await getVerifiedSession();
    lessonId = (await params).lessonId;
    const { searchParams } = new URL(request.url);
    logTutoringDebug("chat:get:start", {
      requestId,
      lessonId,
      userId: session.user.id,
      language: searchParams.get("language"),
      durationMs: timer.elapsedMs(),
    });
    const { access, deniedReason, studyLanguage } = await resolveStudentTutoringContext({
      userId: session.user.id,
      lessonId,
      language: searchParams.get("language"),
      preferredLanguage: session.user.preferredLanguage,
    });

    if (!access && deniedReason) {
      return apiError(
        deniedReason === STUDENT_TUTORING_ACCESS_REASON.LESSON_UNAVAILABLE
          ? "NOT_FOUND"
          : "VALIDATION_ERROR",
        getStudentTutoringAccessFailureMessage(deniedReason),
      );
    }
    if (!access) return apiError("UNAUTHORIZED", "Unauthorized");

    const existingActiveSession = await getActiveStudentSession({
      classroomStudentId: access.classroomStudent.id,
      lessonId,
      sessionType: TUTORING_STATUS.sessionTypeTutoring,
      sessionLocale: studyLanguage,
    });
    const latestCompletedSession =
      existingActiveSession ??
      (await getLatestCompletedStudentSession({
        classroomStudentId: access.classroomStudent.id,
        lessonId,
        sessionType: TUTORING_STATUS.sessionTypeTutoring,
      }));
    const tutorSession =
      latestCompletedSession ??
      (await ensureTutoringSession({
        lessonId,
        access,
        studyLanguage,
      }));
    const messages = await listStudentSessionMessages(tutorSession.id);
    const state = studentSessionStateSchema.parse(tutorSession.state ?? {});
    logTutoringDebug("chat:get:ready", {
      requestId,
      lessonId,
      sessionId: tutorSession.id,
      sessionLocale: tutorSession.sessionLocale,
      stateVersion: tutorSession.stateVersion,
      messageCount: messages.length,
      recentMessages: summarizeTutoringMessages(messages.slice(-4)),
      durationMs: timer.elapsedMs(),
    });

    const response = NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
        sessionStatus: tutorSession.sessionStatus,
        sessionLocale: normalizeAppLocale(tutorSession.sessionLocale),
        sourceLocale: normalizeAppLocale(access.lesson.contentLocale),
        lesson: {
          id: access.lesson.id,
          title: access.lesson.title,
          courseId: access.lesson.courseId,
          courseTitle: access.lesson.course.title,
        },
        sessionState: state,
        messages: messages.map((message) => ({
          ...message,
          parts: message.parts ?? undefined,
          metadata: message.metadata ?? undefined,
        })),
      },
    });
    response.headers.set("x-tutoring-request-id", requestId);
    response.headers.set("x-tutoring-request-ms", String(timer.elapsedMs()));
    return response;
  } catch (error) {
    logTutoringError("chat:get:error", error, { lessonId, requestId });
    return handleTutoringRouteError(error, "Failed to load tutoring session", "lesson-tutoring-session:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  let lessonId = "unknown";
  const requestId = crypto.randomUUID();
  const timer = createTutoringTimer();
  try {
    const session = await getVerifiedSession();
    lessonId = (await params).lessonId;
    const { access, deniedReason } = await resolveStudentTutoringContext({
      userId: session.user.id,
      lessonId,
    });
    logTutoringDebug("chat:post:start", {
      requestId,
      lessonId,
      userId: session.user.id,
      durationMs: timer.elapsedMs(),
    });

    if (!access && deniedReason) {
      return apiError(
        deniedReason === STUDENT_TUTORING_ACCESS_REASON.LESSON_UNAVAILABLE
          ? "NOT_FOUND"
          : "VALIDATION_ERROR",
        getStudentTutoringAccessFailureMessage(deniedReason),
      );
    }
    if (!access) return apiError("UNAUTHORIZED", "Unauthorized");

    const body = requestSchema.parse(await request.json());
    const studyLanguage = resolveStudyLanguage({
      language: body.language,
      preferredLanguage: session.user.preferredLanguage,
    });
    const latestUserText = getLatestUserText(body.messages);
    logTutoringDebug("chat:post:parsed", {
      requestId,
      lessonId,
      sessionId: body.sessionId ?? null,
      studyLanguage,
      messageCount: body.messages.length,
      latestUserText: summarizeTutoringText(latestUserText, 180),
      rawMessages: summarizeTutoringMessages(body.messages.slice(-4)),
      durationMs: timer.elapsedMs(),
    });

    if (!latestUserText) {
      return apiError("VALIDATION_ERROR", "Message is required");
    }

    const scopeDecision = await evaluateTutoringScope({
      lessonTitle: access.lesson.title,
      latestUserText,
    });
    logTutoringDebug("chat:post:scope-decision", {
      requestId,
      lessonId,
      shouldRedirect: scopeDecision.shouldRedirect,
      classification: scopeDecision.classification,
      redirectMessage: summarizeTutoringText(scopeDecision.redirectMessage, 180),
      durationMs: timer.elapsedMs(),
    });

    const tutorSession = await ensureTutoringSession({
      lessonId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });
    const state = studentSessionStateSchema.parse(tutorSession.state ?? {});
    logTutoringDebug("chat:post:session", {
      requestId,
      lessonId,
      sessionId: tutorSession.id,
      sessionLocale: tutorSession.sessionLocale,
      stateVersion: tutorSession.stateVersion,
      turnCount: state.turnCount,
      frameworkId: state.frameworkId,
      groundingPackVersion: state.groundingPackVersion,
      durationMs: timer.elapsedMs(),
    });

    const scopeRedirectResponse = await maybeHandleScopeRedirect({
      shouldRedirect: scopeDecision.shouldRedirect,
      sessionId: tutorSession.id,
      classroomStudentId: access.classroomStudent.id,
      lessonId,
      latestUserText,
      classification: scopeDecision.classification,
      redirectMessage: scopeDecision.redirectMessage,
    });

    if (scopeRedirectResponse) return scopeRedirectResponse;

    void logUserTurn({
      sessionId: tutorSession.id,
      classroomStudentId: access.classroomStudent.id,
      lessonId,
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    }).catch((error) => {
      logTutoringError("chat:post:user-log-failed", error, {
        requestId,
        lessonId,
        sessionId: tutorSession.id,
      });
    });
    logTutoringDebug("chat:post:user-logged", {
      requestId,
      lessonId,
      sessionId: tutorSession.id,
      latestUserText: summarizeTutoringText(latestUserText, 180),
      durationMs: timer.elapsedMs(),
    });

    const { previousAssistant, prepared, tools, sanitizedMessages } =
      await prepareTutoringTurn({
        lessonId,
        access,
        tutorSessionId: tutorSession.id,
        studyLanguage,
        state,
        latestUserText,
        messages: body.messages,
      });
    logTutoringDebug("chat:post:prepared", {
      requestId,
      lessonId,
      sessionId: tutorSession.id,
      systemPromptLength: prepared.systemPrompt.length,
      toolNames: Object.keys(tools),
      sanitizedMessages: summarizeTutoringMessages(sanitizedMessages),
      previousAssistant: previousAssistant ? summarizeTutoringText(previousAssistant.content, 180) : null,
      activeFrameworkId: prepared.activeFramework.frameworkId,
      contentScopeVersion: prepared.contentScope.groundingPackVersion,
      contextBundleVersionId: prepared.contextBundle.versionId,
      groundingUnitCount: prepared.groundingUnits.length,
      durationMs: timer.elapsedMs(),
    });

    const { streamAgentResponse } = await import("@/shared/ai");
    logTutoringDebug("chat:post:stream-start", {
      requestId,
      lessonId,
      sessionId: tutorSession.id,
      model: "flashModel",
      durationMs: timer.elapsedMs(),
    });

    const response = await streamAgentResponse(sanitizedMessages, prepared.systemPrompt, {
      model: flashModel,
      attribution: {
        userId: session.user.id,
        feature: "tutoring-session-chat",
      },
      tools,
      maxTokens: 1000,
      temperature: 0.3,
      promptCache: prepared.promptCache,
      onFinish: async (result) => {
        await finalizeTutoringTurn({
          lessonId,
          tutorSessionId: tutorSession.id,
          state,
          expectedStateVersion: tutorSession.stateVersion ?? 1,
          latestUserText,
          access,
          sessionUserId: session.user.id,
          prepared,
          previousAssistantText: previousAssistant?.content ?? null,
          result: {
            steps: result.steps.map((step) => ({
              text: step.text,
              toolCalls: step.toolCalls.flatMap((toolCall) =>
                toolCall
                  ? [
                      {
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        input: toolCall.input,
                        args:
                          "args" in toolCall
                            ? toolCall.args
                            : undefined,
                      },
                    ]
                  : [],
              ),
              toolResults: step.toolResults.flatMap((toolResult) =>
                toolResult
                  ? [
                      {
                        toolCallId: toolResult.toolCallId,
                        toolName: toolResult.toolName,
                        input: toolResult.input,
                        output: toolResult.output,
                      },
                    ]
                  : [],
              ),
            })),
          },
        });
      },
    });
    response.headers.set("x-tutoring-request-id", requestId);
    response.headers.set("x-tutoring-request-ms", String(timer.elapsedMs()));
    return response;
  } catch (error) {
    logTutoringError("chat:post:error", error, { lessonId, requestId });
    return handleTutoringRouteError(
      error,
      "Failed to continue tutoring",
      "lesson-tutoring-session:post",
    );
  }
}


