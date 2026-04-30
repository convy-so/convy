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

const onboardingTurnSchema = z.object({
  response: z.string(),
  status: z.enum(["continue", "complete"]),
  interestProfile: studentInterestProfileSchema.nullable(),
  studentModelSnapshot: studentModelSnapshotSchema.nullable(),
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

  return await generateStructuredOutput({
    schema: onboardingTurnSchema,
    prompt: buildInterestOnboardingPrompt({
      studentName: params.studentName,
      existingProfile: params.existingProfile,
      existingStudentModel: params.existingStudentModel,
      transcript,
    }),
  });
}

export function buildOnboardingGreeting(studentName: string) {
  return buildOnboardingGreetingPrompt(studentName);
}
