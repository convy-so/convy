import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { evaluateScopePolicy } from "@/lib/ai/scope-policy";
import { buildScopeRedirectResponse, logUserTurn } from "@/lib/learning/tutoring-turn-logging";
import {
  logTutoringDebug,
  summarizeTutoringText,
  measureTutoringStep,
} from "@/lib/learning/tutoring-debug";

export async function evaluateTutoringScope(params: {
  topicTitle: string;
  latestUserText: string;
}) {
  return measureTutoringStep("scope:evaluate", {
    topicTitle: params.topicTitle,
    latestUserText: summarizeTutoringText(params.latestUserText, 180),
  }, async () =>
    await evaluateScopePolicy({
      feature: "tutoring_chat",
      objective: `Help the student learn ${params.topicTitle} using uploaded course materials`,
      currentPhase: "active tutoring session",
      activeTopic: params.topicTitle,
      latestUserMessage: params.latestUserText,
      strictMode: true,
      driftCount: 0,
      allowedDetours: [
        "brief clarification of the current concept",
        "asking what a current term means",
        "replying in another supported language while staying on lesson",
      ],
    }),
  );
}

export async function maybeHandleScopeRedirect(params: {
  shouldRedirect: boolean;
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  latestUserText: string;
  classification: string;
  redirectMessage: string;
}) {
  if (!params.shouldRedirect) return null;
  logTutoringDebug("scope:redirect:start", {
    sessionId: params.sessionId,
    topicId: params.topicId,
    classroomStudentId: params.classroomStudentId,
    classification: params.classification,
    redirectMessage: summarizeTutoringText(params.redirectMessage, 180),
  });

  await logUserTurn({
    sessionId: params.sessionId,
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    content: params.latestUserText,
    metadata: { classification: params.classification },
  });

  const redirect = buildScopeRedirectResponse({
    sessionId: params.sessionId,
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    classification: params.classification,
    redirectMessage: params.redirectMessage,
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "text-delta", id: redirect.streamId, delta: redirect.text });
      await redirect.persist();
      logTutoringDebug("scope:redirect:stream-complete", {
        sessionId: params.sessionId,
        topicId: params.topicId,
      });
    },
  }),
  });
}
