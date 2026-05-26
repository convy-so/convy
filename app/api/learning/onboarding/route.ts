import { type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";
import { z } from "zod";

import { getVerifiedSession } from "@/lib/auth/dal";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import {
  createOnboardingResponseStream,
  finalizeOnboardingTurn,
  getOnboardingState,
  prepareOnboardingTurn,
} from "@/lib/learning/onboarding-route-service";

const requestSchema = z.object({
  sessionId: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()).default([]),
});

function extractLatestUserText(messages: UIMessage[]): string {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUserMessage) {
    return "";
  }

  const contentText =
    "content" in latestUserMessage && typeof latestUserMessage.content === "string"
      ? latestUserMessage.content
      : "";

  const partsText = Array.isArray(latestUserMessage.parts)
    ? latestUserMessage.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
    : "";

  return (partsText || contentText).trim();
}

function extractAssistantText(message: UIMessage): string {
  const contentText =
    "content" in message && typeof message.content === "string"
      ? message.content
      : "";

  const partsText = Array.isArray(message.parts)
    ? message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
    : "";

  return (partsText || contentText).trim();
}

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
    const latestUserText = extractLatestUserText(body.messages);
    if (!latestUserText) return apiError("VALIDATION_ERROR", "Message is required");

    const prepared = await prepareOnboardingTurn({
      userId: session.user.id,
      latestUserText,
    });
    if (!prepared.membership) return apiError("NOT_FOUND", "Student context not found");

    const result = await createOnboardingResponseStream({
      membership: prepared.membership,
      transcript: prepared.transcript,
      existingProfile: prepared.existingProfile,
      existingStudentModel: prepared.existingStudentModel,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: body.messages,
      onFinish: async ({ isAborted, responseMessage }) => {
        if (isAborted) {
          return;
        }

        const assistantResponse = extractAssistantText(responseMessage);
        if (!assistantResponse) {
          return;
        }

        await finalizeOnboardingTurn({
          membership: prepared.membership,
          activeSessionId: prepared.activeSession.id,
          expectedStateVersion: prepared.activeSession.stateVersion ?? 1,
          transcript: prepared.transcript,
          assistantResponse,
          existingProfile: prepared.existingProfile,
        });
      },
      onError: () => {
        return "Something went wrong while continuing onboarding.";
      },
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to continue onboarding", "/api/learning/onboarding");
  }
}
