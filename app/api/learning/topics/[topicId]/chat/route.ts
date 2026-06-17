import { type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { flashModel } from "@/lib/ai";
import {
  getActiveLearningSession,
  getLatestCompletedLearningSession,
  listLearningMessages,
} from "@/lib/learning/storage";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { apiError } from "@/lib/api/error-contract";
import {
  ensureTutoringSession,
  getStudentTutoringAccessFailureMessage,
  resolveStudyLanguage,
  resolveStudentTutoringContext,
} from "@/lib/learning/tutoring-route-orchestrator";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { getLatestUserText, prepareTutoringTurn } from "@/lib/learning/tutoring-turn-preparation";
import { logUserTurn } from "@/lib/learning/tutoring-turn-logging";
import { evaluateTutoringScope, maybeHandleScopeRedirect } from "@/lib/learning/tutoring-chat-route-service";
import { finalizeTutoringTurn } from "@/lib/learning/tutoring-turn-finalization";
import {
  logTutoringDebug,
  logTutoringError,
  summarizeTutoringMessages,
  summarizeTutoringText,
  createTutoringTimer,
} from "@/lib/learning/tutoring-debug";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  let topicId = "unknown";
  const requestId = crypto.randomUUID();
  const timer = createTutoringTimer();
  try {
    const session = await getVerifiedSession();
    topicId = (await params).topicId;
    const { searchParams } = new URL(request.url);
    logTutoringDebug("chat:get:start", {
      requestId,
      topicId,
      userId: session.user.id,
      language: searchParams.get("language"),
      durationMs: timer.elapsedMs(),
    });
    const { access, deniedReason, studyLanguage } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
      language: searchParams.get("language"),
      preferredLanguage: session.user.preferredLanguage,
    });

    if (!access && deniedReason) {
      return apiError(
        deniedReason === "topic_unavailable" ? "NOT_FOUND" : "VALIDATION_ERROR",
        getStudentTutoringAccessFailureMessage(deniedReason),
      );
    }
    if (!access) return apiError("UNAUTHORIZED", "Unauthorized");

    const existingActiveSession = await getActiveLearningSession({
      classroomStudentId: access.classroomStudent.id,
      topicId,
      sessionType: "tutoring",
      sessionLocale: studyLanguage,
    });
    const latestCompletedSession =
      existingActiveSession ??
      (await getLatestCompletedLearningSession({
        classroomStudentId: access.classroomStudent.id,
        topicId,
        sessionType: "tutoring",
      }));
    const tutorSession =
      latestCompletedSession ??
      (await ensureTutoringSession({
        topicId,
        access,
        studyLanguage,
      }));
    const messages = await listLearningMessages(tutorSession.id);
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});
    logTutoringDebug("chat:get:ready", {
      requestId,
      topicId,
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
        sourceLocale: normalizeAppLocale(access.topic.contentLocale),
        lesson: {
          id: access.topic.id,
          title: access.topic.title,
          courseId: access.topic.courseId,
          courseTitle: access.topic.course.title,
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
    logTutoringError("chat:get:error", error, { topicId, requestId });
    return handleLearningRouteError(error, "Failed to load tutoring session", "learning-topic-chat:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  let topicId = "unknown";
  const requestId = crypto.randomUUID();
  const timer = createTutoringTimer();
  try {
    const session = await getVerifiedSession();
    topicId = (await params).topicId;
    const { access, deniedReason } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
    });
    logTutoringDebug("chat:post:start", {
      requestId,
      topicId,
      userId: session.user.id,
      durationMs: timer.elapsedMs(),
    });

    if (!access && deniedReason) {
      return apiError(
        deniedReason === "topic_unavailable" ? "NOT_FOUND" : "VALIDATION_ERROR",
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
      topicId,
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
      topicTitle: access.topic.title,
      latestUserText,
    });
    logTutoringDebug("chat:post:scope-decision", {
      requestId,
      topicId,
      shouldRedirect: scopeDecision.shouldRedirect,
      classification: scopeDecision.classification,
      redirectMessage: summarizeTutoringText(scopeDecision.redirectMessage, 180),
      durationMs: timer.elapsedMs(),
    });

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});
    logTutoringDebug("chat:post:session", {
      requestId,
      topicId,
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
      topicId,
      latestUserText,
      classification: scopeDecision.classification,
      redirectMessage: scopeDecision.redirectMessage,
    });

    if (scopeRedirectResponse) return scopeRedirectResponse;

    void logUserTurn({
      sessionId: tutorSession.id,
      classroomStudentId: access.classroomStudent.id,
      topicId,
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    }).catch((error) => {
      logTutoringError("chat:post:user-log-failed", error, {
        requestId,
        topicId,
        sessionId: tutorSession.id,
      });
    });
    logTutoringDebug("chat:post:user-logged", {
      requestId,
      topicId,
      sessionId: tutorSession.id,
      latestUserText: summarizeTutoringText(latestUserText, 180),
      durationMs: timer.elapsedMs(),
    });

    const { previousAssistant, prepared, tools, sanitizedMessages } =
      await prepareTutoringTurn({
        topicId,
        access,
        tutorSessionId: tutorSession.id,
        studyLanguage,
        state,
        latestUserText,
        messages: body.messages,
      });
    logTutoringDebug("chat:post:prepared", {
      requestId,
      topicId,
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

    const { streamAgentResponse } = await import("@/lib/ai");
    logTutoringDebug("chat:post:stream-start", {
      requestId,
      topicId,
      sessionId: tutorSession.id,
      model: "flashModel",
      durationMs: timer.elapsedMs(),
    });

    const response = await streamAgentResponse(sanitizedMessages, prepared.systemPrompt, {
      model: flashModel,
      attribution: {
        userId: session.user.id,
        feature: "learning-tutor-chat",
      },
      tools,
      maxTokens: 1000,
      temperature: 0.3,
      promptCache: prepared.promptCache,
      onFinish: async (result) => {
        await finalizeTutoringTurn({
          topicId,
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
              toolCalls: step.toolCalls,
              toolResults: step.toolResults,
            })),
          },
        });
      },
    });
    response.headers.set("x-tutoring-request-id", requestId);
    response.headers.set("x-tutoring-request-ms", String(timer.elapsedMs()));
    return response;
  } catch (error) {
    logTutoringError("chat:post:error", error, { topicId, requestId });
    return handleLearningRouteError(
      error,
      "Failed to continue tutoring",
      "learning-topic-chat:post",
    );
  }
}
