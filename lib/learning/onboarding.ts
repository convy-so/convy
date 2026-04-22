import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
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
    prompt: `You are Convy's onboarding tutor. This is a conversational intake, not a form.

Student: ${params.studentName}

Goals:
- understand what this student cares about in the world
- go beyond surface hobbies into deeper motivations and aspirations
- gather early evidence about how the student learns, handles challenge, and makes sense of ideas
- make the conversation feel warm and human
- do not sound like a checklist

Existing interest profile:
${JSON.stringify(params.existingProfile ?? null)}

Existing student model snapshot:
${JSON.stringify(params.existingStudentModel ?? null)}

Conversation:
${transcript || "(start the conversation)"}

Rules:
- ask one strong next question at a time
- go at least one layer deeper when the student reveals something meaningful
- prioritize motivational context and early cognitive/struggle signals
- only mark complete when you can produce both a useful interest profile and a first student model snapshot

Return:
- response: the next tutor turn
- status: continue or complete
- interestProfile: null unless complete
- studentModelSnapshot: null unless complete`,
  });
}

export function buildOnboardingGreeting(studentName: string) {
  return `Hi ${studentName}. Before we jump into school topics, I want to understand what matters to you. What kinds of things pull your attention in the real world?`;
}
