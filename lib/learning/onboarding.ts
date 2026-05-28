import type { UIMessage } from "ai";
import { z } from "zod";

import { generateStructuredOutput, streamUiText } from "@/lib/ai/runtime";
import {
  buildInterestOnboardingConversationPrompt,
  buildInterestOnboardingEvaluationPrompt,
  buildOnboardingGreeting as buildOnboardingGreetingPrompt,
  onboardingTurnPromptSpec,
} from "@/lib/learning/prompts/onboarding";
import {
  studentInterestProfileSchema,
  type StudentInterestProfile,
} from "@/lib/learning/types";

const onboardingTurnSchema = z.object({
  response: z.string(),
  status: z.enum(["continue", "complete"]),
  interestProfile: studentInterestProfileSchema
    .extend({ lastUpdated: z.string().optional() })
    .nullable(),
});

type OnboardingMessage = {
  role: "user" | "assistant";
  content: string;
};

function messagesToTranscript(messages: OnboardingMessage[]) {
  return messages
    .map((message) =>
      `${message.role === "user" ? "Student" : "Tutor"}: ${message.content}`,
    )
    .join("\n\n");
}

export function shouldRefreshInterestProfile(
  profile: StudentInterestProfile | null | undefined,
) {
  if (!profile?.lastUpdated) return true;

  const lastUpdated = new Date(profile.lastUpdated);
  const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

  return daysSince >= 30;
}

export async function runInterestOnboardingTurn(params: {
  studentName: string;
  existingProfile?: StudentInterestProfile | null;
  messages: OnboardingMessage[];
}) {
  const transcript = messagesToTranscript(params.messages);
  const now = new Date().toISOString();

  const raw = await generateStructuredOutput({
    schema: onboardingTurnSchema,
    prompt: buildInterestOnboardingEvaluationPrompt({
      studentName: params.studentName,
      existingProfile: params.existingProfile,
      transcript,
    }),
    promptSpec: onboardingTurnPromptSpec,
    maxOutputTokens: 1100,
  });

  return {
    response: raw.response,
    status: raw.status,
    interestProfile: raw.interestProfile
      ? { ...raw.interestProfile, lastUpdated: now }
      : null,
  };
}

function toUIMessages(messages: OnboardingMessage[]): UIMessage[] {
  return messages.map((message, index) => ({
    id: `onboarding-history-${index}`,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));
}

export async function streamInterestOnboardingTurn(params: {
  studentName: string;
  existingProfile?: StudentInterestProfile | null;
  messages: OnboardingMessage[];
}) {
  const transcript = messagesToTranscript(params.messages);

  return streamUiText({
    messages: toUIMessages(params.messages),
    system: buildInterestOnboardingConversationPrompt({
      studentName: params.studentName,
      existingProfile: params.existingProfile,
      transcript,
    }),
    maxOutputTokens: 280,
    temperature: 0.4,
    promptSpec: onboardingTurnPromptSpec,
  });
}

export function buildOnboardingGreeting(studentName: string) {
  return buildOnboardingGreetingPrompt(studentName);
}
