import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import {
  buildInterestOnboardingPrompt,
  buildOnboardingGreeting as buildOnboardingGreetingPrompt,
} from "@/lib/learning/prompts/onboarding";
import {
  studentModelSnapshotSchema,
  studentInterestProfileSchema,
  type StudentInterestProfile,
  type StudentModelSnapshot,
} from "@/lib/learning/types";

/**
 * Inner schema returned by the LLM — timestamps are optional here because
 * the model reliably omits or gets them wrong. We inject them server-side.
 */
const onboardingTurnSchema = z.object({
  response: z.string(),
  status: z.enum(["continue", "complete"]),
  interestProfile: studentInterestProfileSchema
    .extend({ lastUpdated: z.string().optional() })
    .nullable(),
  studentModelSnapshot: studentModelSnapshotSchema
    .extend({ updatedAt: z.string().optional() })
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
  existingStudentModel?: StudentModelSnapshot | null;
  messages: OnboardingMessage[];
}) {
  const transcript = messagesToTranscript(params.messages);
  const now = new Date().toISOString();

  const raw = await generateStructuredOutput({
    schema: onboardingTurnSchema,
    prompt: buildInterestOnboardingPrompt({
      studentName: params.studentName,
      existingProfile: params.existingProfile,
      existingStudentModel: params.existingStudentModel,
      transcript,
    }),
  });

  // Inject server-generated timestamps so the model doesn't have to produce them
  return {
    response: raw.response,
    status: raw.status,
    interestProfile: raw.interestProfile
      ? { ...raw.interestProfile, lastUpdated: now }
      : null,
    studentModelSnapshot: raw.studentModelSnapshot
      ? { ...raw.studentModelSnapshot, updatedAt: now }
      : null,
  };
}

export function buildOnboardingGreeting(studentName: string) {
  return buildOnboardingGreetingPrompt(studentName);
}
