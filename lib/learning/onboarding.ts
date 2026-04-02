import { generateText, Output } from "ai";
import { z } from "zod";

import { defaultModel } from "@/lib/ai";
import {
  studentInterestProfileSchema,
  type StudentInterestProfile,
} from "@/lib/learning/types";

const onboardingTurnSchema = z.object({
  response: z.string(),
  status: z.enum(["continue", "complete"]),
  profile: studentInterestProfileSchema.nullable(),
});

type OnboardingMessage = {
  role: "user" | "assistant";
  content: string;
};

function messagesToTranscript(messages: OnboardingMessage[]) {
  return messages
    .map((message) =>
      `${message.role === "user" ? "Student" : "Agent"}: ${message.content}`,
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

  const { output } = await generateText({
    model: defaultModel,
    output: Output.object({
      schema: onboardingTurnSchema,
    }),
    prompt: `You are having the very first warm, non-academic conversation with a student named ${params.studentName}.

Goals:
- sound warm, curious, and human
- do not sound like a form, interview, or teacher
- naturally explore hobbies, future hopes, curiosity areas, relationship with learning, and early signals about how this student learns
- go at least two levels deep when the student shares an interest
- transition naturally from interests into real learning experiences
- only finish when you have enough to build a useful profile and a first-pass picture of how to teach this student well

If there is an existing profile, use it only to make the conversation feel remembered and natural:
${params.existingProfile ? JSON.stringify(params.existingProfile) : "none"}

Conversation so far:
${transcript || "(start the conversation)"}

Important learning-style discovery goals:
- listen for whether they prefer big-picture first or parts first
- listen for whether they need examples before abstractions
- listen for what happens when they get stuck or are wrong
- listen for whether they process quickly/broadly or slowly/deeply
- listen for whether they learn best through dialogue or independent thinking
- listen for whether they study by memorizing or by understanding
- listen for whether stories, diagrams, examples, logic, or doing are what make things click

How to ask:
- never ask in a checklist or survey style
- ask about real experiences they have already had
- use genuine follow-up questions
- if they describe something they understand well, ask how they came to understand it
- if they describe being stuck, ask what that felt like and what happened next
- make the conversation feel like one continuous dialogue about their life and learning

Return:
- response: the next thing the agent should say
- status: continue or complete
- profile: null unless complete`,
  });

  return output;
}

export function buildOnboardingGreeting(studentName: string) {
  return `Hi ${studentName}. Before we get into classwork, I want to get to know you a bit. What do you usually enjoy doing when you're not in class?`;
}
