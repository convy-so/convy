import { type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { flashModel } from "@/lib/ai";
import { listLearningMessages } from "@/lib/learning/storage";
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

const requestSchema = z.object({
  sessionId: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const { searchParams } = new URL(request.url);
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

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      studyLanguage,
    });
    const messages = await listLearningMessages(tutorSession.id);
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

    return NextResponse.json({
      success: true,
      data: {
        sessionId: tutorSession.id,
        sessionLocale: normalizeAppLocale(tutorSession.sessionLocale),
        sourceLocale: normalizeAppLocale(access.topic.contentLocale),
        lesson: {
          id: access.topic.id,
          title: access.topic.title,
          subject: access.topic.subject,
          subjectKey: access.topic.subjectKey,
        },
        sessionState: state,
        messages: messages.map((message) => ({
          ...message,
          metadata: message.metadata ?? undefined,
        })),
      },
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load tutoring session", "learning-topic-chat:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const { access, deniedReason } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
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

    if (!latestUserText) {
      return apiError("VALIDATION_ERROR", "Message is required");
    }

    if (body.sessionId) {
      const requestedSession = await resolveStudentTutoringSessionById({
        sessionId: body.sessionId,
        topicId,
        classroomStudentId: access.classroomStudent.id,
      });

      if (!requestedSession) {
        return apiError("NOT_FOUND", "Tutoring session not found.");
      }

      if (requestedSession.sessionStatus !== "active") {
        return apiError("VALIDATION_ERROR", "Tutoring session is no longer active.");
      }

      if (requestedSession.sessionLocale !== studyLanguage) {
        return apiError(
          "VALIDATION_ERROR",
          "Tutoring session language does not match this lesson workspace.",
        );
      }
    }

    const scopeDecision = await evaluateTutoringScope({
      topicTitle: access.topic.title,
      latestUserText,
    });

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

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

    await logUserTurn({
      sessionId: tutorSession.id,
      classroomStudentId: access.classroomStudent.id,
      topicId,
      content: latestUserText,
      metadata: {
        messageKind: "student_turn",
      },
    });

    const { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages } =
      await prepareTutoringTurn({
        topicId,
        access,
        tutorSessionId: tutorSession.id,
        studyLanguage,
        state,
        latestUserText,
        messages: body.messages,
      });

    const { streamAgentResponse } = await import("@/lib/ai");

    return await streamAgentResponse(sanitizedMessages, prepared.systemPrompt, {
      model: flashModel,
      attribution: {
        userId: session.user.id,
        feature: "learning-tutor-chat",
      },
      tools,
      maxTokens: 1000,
      temperature: 0.3,
      dynamicExamples: fewShotExamples,
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
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to continue tutoring",
      "learning-topic-chat:post",
    );
  }
}
