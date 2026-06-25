import type { UIMessage } from "ai";
import { z } from "zod";

import { generateStructuredOutput, streamUiText } from "@/shared/ai/model-generation";
import {
  buildInterestOnboardingConversationPrompt,
  buildInterestOnboardingEvaluationPrompt,
  buildOnboardingGreeting as buildOnboardingGreetingPrompt,
  onboardingTurnPromptSpec,
} from "@/features/tutoring/server/prompts/onboarding";
import {
  studentInterestProfileSchema,
  type StudentInterestProfile,
} from "@/features/tutoring/public-server";
import {
  LEARNING_LIMITS,
  ONBOARDING_TURN_STATUS_VALUES,
} from "@/shared/learning/constants";

const onboardingTurnSchema = z.object({
  response: z.string(),
  status: z.enum(ONBOARDING_TURN_STATUS_VALUES),
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

  return daysSince >= LEARNING_LIMITS.interestProfileRefreshDays;
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
    maxOutputTokens: LEARNING_LIMITS.onboardingEvaluationMaxOutputTokens,
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
    maxOutputTokens: LEARNING_LIMITS.onboardingStreamMaxOutputTokens,
    temperature: 0.4,
    promptSpec: onboardingTurnPromptSpec,
  });
}

export function buildOnboardingGreeting(studentName: string) {
  return buildOnboardingGreetingPrompt(studentName);
}
