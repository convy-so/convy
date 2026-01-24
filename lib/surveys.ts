import type {
  surveys,
  SurveyObjective,
  SurveyTargetAudience,
  SurveyScope,
  SurveySuccessCriteria,
  SurveyConstraints,
  SurveyHypotheses,
  SurveyMedia,
} from "@/db/schema";

export const MAX_SAMPLE_CONVERSATIONS = 3;

/**
 * Build complete survey configuration from structured data in the database schema
 */
export function buildCompleteSurveyConfig(
  survey: typeof surveys.$inferSelect
): {
  information: string;
  requiredQuestions: string[];
  metrics: string[];
  language: "en" | "fr" | "de";
  objective?: SurveyObjective;
  targetAudience?: SurveyTargetAudience;
  scope?: SurveyScope;
  successCriteria?: SurveySuccessCriteria;
  constraints?: SurveyConstraints;
  hypotheses?: SurveyHypotheses;
  tone?: ToneProfile;
  additionalContext?: string;
  media?: SurveyMedia[];
  personalInfo?: string[];
  domainId?: number;
} {
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
    additionalContext: survey.additionalContext ?? undefined,
    media: survey.media ?? undefined,
    personalInfo: survey.personalInfo ?? undefined,
    domainId: survey.domainId ?? undefined,
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
    required: true,
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
    required: false,
    priority: 7,
    description: "Conversation style preferences",
    qualityChecks: ["Formality level is specified"],
  },

  requiredQuestions: {
    required: false,
    priority: 8,
    description: "Specific questions to include in the survey",
    qualityChecks: [
      "Questions are clearly stated",
      "Questions align with the survey objective",
    ],
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
