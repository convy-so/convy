import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import { extractMessageText, toPersistedUIChatMessages } from "@/lib/chat-ui-messages";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import {
  finalizeCompletedOnboarding,
  getOnboardingState,
  runOnboardingTurn,
} from "@/lib/learning/onboarding-route-service";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const state = await getOnboardingState(session.user.id);

    if (!state.membership) return apiError("NOT_FOUND", "Student context not found");
    if (state.completed) return NextResponse.json({ completed: true, profile: state.profile });

    return NextResponse.json({
      completed: false,
      sessionId: state.sessionId,
      messages: state.messages,
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load onboarding", "/api/learning/onboarding");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = requestSchema.parse(await request.json());
    const latestUserMessage = [...body.messages].reverse().find((message) => message.role === "user");
    const latestUserText = extractMessageText(
      latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null,
    ).trim();
    if (!latestUserText) return apiError("VALIDATION_ERROR", "Message is required");

    const runResult = await runOnboardingTurn({ userId: session.user.id, latestUserText });
    if (!runResult.membership) return apiError("NOT_FOUND", "Student context not found");

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", id: `onboarding-${Date.now()}`, delta: runResult.result.response });

          if (
            runResult.result.status === "complete" &&
            runResult.result.interestProfile &&
            runResult.result.studentModelSnapshot
          ) {
            await finalizeCompletedOnboarding({
              membership: runResult.membership,
              studentModelId: runResult.studentModel.id,
              activeSessionId: runResult.activeSession.id,
              expectedStateVersion: runResult.activeSession.stateVersion ?? 1,
              interestProfile: runResult.result.interestProfile,
              studentModelSnapshot: runResult.result.studentModelSnapshot,
            });
          }
        },
      }),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to continue onboarding", "/api/learning/onboarding");
  }
}
