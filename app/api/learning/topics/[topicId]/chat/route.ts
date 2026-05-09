import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/dal";
import { listLearningMessages } from "@/lib/learning/storage";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { apiError } from "@/lib/api/error-contract";
import {
  ensureTutoringSession,
  resolveStudyLanguage,
  resolveStudentTutoringContext,
} from "@/lib/learning/tutoring-route-orchestrator";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { finalizeTutoringTurn } from "@/lib/learning/tutoring-turn-finalization";
import { buildScopeRedirectResponse, logUserTurn } from "@/lib/learning/tutoring-turn-logging";
import { getLatestUserText, prepareTutoringTurn } from "@/lib/learning/tutoring-turn-preparation";

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
    const { access, studyLanguage } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
      language: searchParams.get("language"),
      preferredLanguage: session.user.preferredLanguage,
    });

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
        sourceLocale: access.topic.contentLocale,
        topic: {
          id: access.topic.id,
          title: access.topic.title,
          subject: access.topic.subject,
          subjectKey: access.topic.subjectKey,
          subjectLabel: access.topic.subjectLabel,
        },
        sessionState: state,
        messages,
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
    const { access } = await resolveStudentTutoringContext({
      userId: session.user.id,
      topicId,
    });

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

    const scopeDecision = await evaluateScopePolicy({
      feature: "tutoring_chat",
      objective: `Help the student learn ${access.topic.title} using uploaded course materials`,
      currentPhase: "active tutoring session",
      activeTopic: access.topic.title,
      latestUserMessage: latestUserText,
      strictMode: true,
      driftCount: 0,
      allowedDetours: [
        "brief clarification of the current concept",
        "asking what a current term means",
        "replying in another supported language while staying on lesson",
      ],
    });

    const tutorSession = await ensureTutoringSession({
      topicId,
      access,
      sessionId: body.sessionId,
      studyLanguage,
    });
    const state = learningSessionStateSchema.parse(tutorSession.state ?? {});

    if (scopeDecision.shouldRedirect) {
      await logUserTurn({
        sessionId: tutorSession.id,
        classroomStudentId: access.classroomStudent.id,
        topicId,
        content: latestUserText,
        metadata: {
          classification: scopeDecision.classification,
        },
      });
      const redirect = buildScopeRedirectResponse({
        sessionId: tutorSession.id,
        classroomStudentId: access.classroomStudent.id,
        topicId,
        classification: scopeDecision.classification,
        redirectMessage: scopeDecision.redirectMessage,
      });
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "text-delta", id: redirect.streamId, delta: redirect.text });
            await redirect.persist();
          },
        }),
      });
    }

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
