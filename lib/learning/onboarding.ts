import type { UIMessage } from "ai";
import { z } from "zod";

import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
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
  const latestUserMessage =
    [...params.messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const dynamicExamples = await getDynamicFewShotExamples({
    feature: "learning_onboarding",
    limit: 3,
    context: [
      params.studentName,
      latestUserMessage,
      params.existingProfile?.primaryInterests
        .map((interest) => interest.label)
        .join(", "),
      params.existingProfile?.aspirations.join(", "),
    ]
      .filter(Boolean)
      .join(" | "),
  });

  const raw = await generateStructuredOutput({
    schema: onboardingTurnSchema,
    prompt: buildInterestOnboardingEvaluationPrompt({
      studentName: params.studentName,
      existingProfile: params.existingProfile,
      transcript,
    }),
    promptSpec: onboardingTurnPromptSpec,
    dynamicExamples,
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
  const latestUserMessage =
    [...params.messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const dynamicExamples = await getDynamicFewShotExamples({
    feature: "learning_onboarding",
    limit: 3,
    context: [
      params.studentName,
      latestUserMessage,
      params.existingProfile?.primaryInterests
        .map((interest) => interest.label)
        .join(", "),
      params.existingProfile?.aspirations.join(", "),
    ]
      .filter(Boolean)
      .join(" | "),
  });

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
    dynamicExamples,
  });
}

export function buildOnboardingGreeting(studentName: string) {
  return buildOnboardingGreetingPrompt(studentName);
}
