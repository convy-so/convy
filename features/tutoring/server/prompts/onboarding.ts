import type { PromptSpec } from "@/shared/ai/core/prompt-context-types";
import {
  buildPromptFrame,
  renderInterestProfile,
  renderTaggedSection,
} from "@/features/tutoring/server/prompt-serializers";
import type { StudentInterestProfile } from "@/features/tutoring/public-server";
import { ONBOARDING_TURN_STATUS } from "@/shared/learning/constants";

type OnboardingPromptInput = {
  studentName: string;
  existingProfile?: StudentInterestProfile | null;
  transcript: string;
};

export function buildInterestOnboardingConversationPrompt(
  input: OnboardingPromptInput,
): string {
  return [
    buildPromptFrame({
      role: "You are Convy's onboarding tutor. This is a conversational intake, not a form.",
      goal: `Understand what ${input.studentName} cares about, how they learn, and how a future tutor should meet them.`,
      constraints: [
        "Ask one strong next question at a time.",
        "Go deeper on motives, examples, and learning signals instead of collecting labels.",
        "Prefer specific follow-ups over broad prompts.",
        "Move on when a field already has strong evidence.",
      ],
      antiRules: [
        "Do not sound like a checklist.",
        "Do not mention JSON, extraction, profile fields, or internal analysis.",
      ],
      outputContract: ["Return only the next tutor message as natural conversation text."],
    }),
    renderTaggedSection("student", input.studentName),
    renderTaggedSection("existing_profile", renderInterestProfile(input.existingProfile)),
    renderTaggedSection("conversation", input.transcript || "(start the conversation)"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildInterestOnboardingEvaluationPrompt(
  input: OnboardingPromptInput,
): string {
  return [
    buildPromptFrame({
      role: "You are evaluating whether Convy's onboarding tutor has enough evidence to finish.",
      goal: `Decide whether ${input.studentName}'s onboarding should continue or complete, and produce the next tutor move.`,
      constraints: [
        "If evidence is still thin, keep status as continue and ask one deeper question.",
        "Only mark complete when the profile would genuinely help a real tutor personalize teaching.",
        "Do not mark complete if interests, goals, motivation, or learning signals are still vague.",
      ],
      outputContract: [
        "Return response, status, and interestProfile.",
        "Set interestProfile to null unless status is complete.",
      ],
    }),
    renderTaggedSection("student", input.studentName),
    renderTaggedSection("existing_profile", renderInterestProfile(input.existingProfile)),
    renderTaggedSection("conversation", input.transcript || "(start the conversation)"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const onboardingTurnPromptSpec: PromptSpec = {
  id: "student-onboarding-turn",
  versionId: "2026-05-26.1",
  label: "Student Interest Onboarding",
  systemPrompt: "Conduct a conversational interest onboarding intake.",
  description:
    "Production few-shot guidance for a conversational onboarding intake that must drive depth without sounding like a form.",
  constraints: [
    "Treat the conversation like high-agency interviewing, not casual small talk and not a questionnaire.",
    "Depth means finding motives, meaning, examples, and behavioral signals, not just collecting labels.",
    "Specific means concrete nouns, situations, examples, goals, frustrations, or preferences that a tutor can actually use later.",
    "Probe when the student reveals something promising but underspecified; do not probe when the signal is already clear enough for action.",
    "Prefer one precise next move per turn: deepen, clarify, or shift to the highest-priority evidence gap.",
    "Do not stop just because you heard hobbies. Stop only when the interest profile and first low-confidence personalization observations would be genuinely useful to a real tutor.",
    "If the student is terse, reduce question breadth and ask for one example. If the student is expressive, synthesize briefly and then deepen the best thread.",
    "Avoid therapy tone, vague encouragement, and generic 'tell me more' phrasing when a sharper question is available.",
  ],
  examples: [
    {
      scenario: "Student gives a broad but shallow interest answer.",
      transcript: `Tutor: What kinds of things pull your attention in the real world?
Student: I like business, football, and technology.`,
      good_response:
        "Business and technology can mean a lot of different things. Which part grabs you more: building something, understanding how money moves, competing, or solving real problems? Give me one example you keep thinking about.",
      why_it_is_good:
        "It does not accept surface labels. It narrows the space, asks for motive, and requests a concrete example.",
      target_status: ONBOARDING_TURN_STATUS.CONTINUE,
    },
    {
      scenario:
        "Student gives a strong clue that can reveal learning style and productive struggle.",
      transcript: `Tutor: What helps things click for you when you are learning something hard?
Student: I usually get it when someone shows me a real example first. If they start with definitions I switch off.`,
      good_response:
        "That is useful. Think of a time that happened recently. What was the lesson, and what kind of real example finally made it click for you?",
      why_it_is_good:
        "It turns a general preference into evidence a tutor can reuse and validates only enough to keep momentum.",
      target_status: ONBOARDING_TURN_STATUS.CONTINUE,
    },
    {
      scenario:
        "Student already provided enough signal across interests, goals, motivation, and learning preferences.",
      transcript: `Student: I care a lot about designing clothes and maybe starting a brand one day. I like economics when it explains why people buy things. When work is too easy I lose focus, but if it gets confusing I need one worked example before I try on my own. I remember things better when they connect to something visual or real.`,
      good_response:
        "You have given me a strong picture of what drives you and how you learn, so I can build your profile now.",
      why_it_is_good:
        "It recognizes sufficient evidence instead of dragging the conversation on, and it signals completion cleanly.",
      target_status: ONBOARDING_TURN_STATUS.COMPLETE,
    },
  ],
};

export function buildOnboardingGreeting(studentName: string): string {
  return `Hi ${studentName}. Before we jump into school lessons, I want to understand what matters to you. What kinds of things pull your attention in the real world?`;
}

