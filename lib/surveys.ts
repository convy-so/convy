import type {
  SurveyConfig,
} from "./prompts";
import type {
  surveys,
} from "@/db/schema";

export const MAX_SAMPLE_CONVERSATIONS = 3;

/**
 * Build complete survey configuration from structured data in the database schema
 */
export function buildCompleteSurveyConfig(
  survey: typeof surveys.$inferSelect
): SurveyConfig {
  const informationParts: string[] = [];
  if (survey.objective?.context)
    informationParts.push(survey.objective.context);
  if (survey.objective?.decision)
    informationParts.push(survey.objective.decision);
  if (survey.successCriteria?.description)
    informationParts.push(survey.successCriteria.description);
  const information =
    informationParts.length > 0
      ? informationParts.join(". ")
      : "Collect participant feedback";

  return {
    id: survey.id,
    information,
    requiredQuestions: survey.requiredQuestions || [],
    metrics: survey.metrics || [],
    language: survey.language,
    objective: survey.objective ?? undefined,
    targetAudience: survey.targetAudience ?? undefined,
    scope: survey.scope ?? undefined,
    successCriteria: survey.successCriteria ?? undefined,
    constraints: survey.constraints ?? undefined,
    hypotheses: survey.hypotheses ?? undefined,
    tone: (survey.tone as ToneProfile) ?? "casual",
    media: survey.media ?? undefined,
    personalInfo: survey.personalInfo ?? undefined,
    domainId: survey.domainId ?? undefined,
    improvementFeedback: survey.improvementFeedback ?? undefined,
  };
}

export const REQUIRED_INFORMATION = {
  objective: {
    required: true,
    priority: 1,
    description: "What they're trying to learn or decide",
    qualityChecks: [
      "Has a clear decision or learning goal",
      "Includes context about why this matters",
      "Is specific enough to guide conversation design",
    ],
  },

  targetAudience: {
    required: true,
    priority: 2,
    description: "Who will be surveyed",
    qualityChecks: [
      "Relationship to the creator is defined",
      "Knowledge level about the topic is clear",
    ],
  },


  scope: {
    required: true,
    priority: 3,
    description: "What ground the survey should cover",
    qualityChecks: [
      "Breadth vs depth preference is clear",
      "Main topics or areas are identified",
      "Boundaries of what's in/out of scope exist",
    ],
  },

  successCriteria: {
    required: true, // Now mandatory to ask
    priority: 4,
    description: "What makes a response valuable",
    qualityChecks: [
      "Type of insights needed is clear (emotional, behavioral, rational)",
      "Level of detail expected is specified",
    ],
  },

  constraints: {
    required: true,
    priority: 5,
    description: "Practical limitations and requirements",
    qualityChecks: [
      "Time constraints are defined",
      "Any sensitive topics or boundaries are noted",
    ],
  },

  hypotheses: {
    required: false,
    priority: 6,
    description: "Existing beliefs to test",
    qualityChecks: ["Assumptions are articulated clearly"],
  },

  tone: {
    required: true, // Now mandatory to ask
    priority: 7,
    description: "Conversation style preferences",
    qualityChecks: ["Formality level is specified"],
  },

  requiredQuestions: {
    required: true,
    priority: 8,
    description: "Specific questions to include in the survey",
    qualityChecks: [
      "Questions are clearly stated",
      "Questions align with the survey objective",
    ],
  },

  media: {
    required: false,
    priority: 9,
    description: "Media (images/videos/audio) to show during conversation",
    qualityChecks: [
      "Media purpose is clear",
      "Context for when to show is defined",
    ],
  },
  metrics: {
    required: true,
    priority: 10,
    description: "Metrics to track (NPS, CSAT, CES, etc.)",
    qualityChecks: ["Metrics align with the survey objective"],
  },

  personalInfo: {
    required: true,
    priority: 11,
    description: "Whether to collect respondent personal data (name, email, age, job title, etc.)",
    qualityChecks: ["Need for personal info is justified"],
  },
} as const;

export const TONE_PROFILES = {
  formal: {
    guidelines: "Professional, no slang, no emojis, polite phrasing",
    example: "Could you describe your experience using the product?",
  },
  casual: {
    guidelines: "Warm, friendly, conversational, light emoji allowed",
    example: "So, how was the experience for you?",
  },
  playful: {
    guidelines: "Fun, energetic wording, emojis welcome",
    example: "Alright, spill the tea — how did it go? 😄",
  },
  empathetic: {
    guidelines: "Supportive, gentle questions, acknowledge feelings",
    example:
      "I understand experiences vary. Could you share what felt hardest?",
  },
} as const;

export type ToneProfile = keyof typeof TONE_PROFILES;
export type RequiredInformationKey = keyof typeof REQUIRED_INFORMATION;
