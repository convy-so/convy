import {
  type GradeBand,
  type GradeLanguagePolicy,
  type SessionOpeningPlan,
  type StudentInterestProfile,
  type TopicSourceBoundary,
  gradeLanguagePolicySchema,
  sessionOpeningPlanSchema,
  topicSourceBoundarySchema,
} from "./types";

const WEB_FIRST_SUBJECT_KEYWORDS = [
  "biology",
  "chemistry",
  "physics",
  "economics",
  "technology",
  "health",
  "environment",
  "geography",
  "engineering",
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeGradeBand(input: string): GradeBand {
  const value = normalizeText(input);

  if (
    value.includes("nursery") ||
    value.includes("kindergarten") ||
    value.includes("pre-school") ||
    value.includes("preschool")
  ) {
    return "nursery";
  }

  if (value.includes("primary") || value.includes("elementary")) {
    return "primary";
  }

  if (
    value.includes("secondary") ||
    value.includes("high school") ||
    value.includes("middle school")
  ) {
    return "secondary";
  }

  return "university";
}

export function getGradeLanguagePolicy(
  gradeBand: GradeBand,
): GradeLanguagePolicy {
  const policyByBand: Record<GradeBand, GradeLanguagePolicy> = {
    nursery: gradeLanguagePolicySchema.parse({
      gradeBand,
      preferredSentenceLength: "short",
      explanationStyle: [
        "Use vivid concrete examples.",
        "Introduce one idea at a time.",
        "Prefer spoken-style wording over abstract definitions.",
      ],
      avoidPatterns: [
        "Do not use heavy jargon.",
        "Do not stack multiple instructions in one sentence.",
        "Do not assume prior academic vocabulary.",
      ],
      quizStyle: [
        "Use playful checks.",
        "Prefer simple either-or and show-me-you-understand prompts.",
      ],
      encouragementStyle: [
        "Celebrate effort often.",
        "Use calm, reassuring language.",
      ],
    }),
    primary: gradeLanguagePolicySchema.parse({
      gradeBand,
      preferredSentenceLength: "short",
      explanationStyle: [
        "Start from familiar life examples.",
        "Define new words immediately.",
        "Use step-by-step explanations.",
      ],
      avoidPatterns: [
        "Avoid dense paragraphs.",
        "Avoid unexplained specialist terms.",
      ],
      quizStyle: [
        "Use short quizzes with quick feedback.",
        "Ask the student to explain back in their own words.",
      ],
      encouragementStyle: [
        "Praise persistence.",
        "Frame mistakes as part of learning.",
      ],
    }),
    secondary: gradeLanguagePolicySchema.parse({
      gradeBand,
      preferredSentenceLength: "mixed",
      explanationStyle: [
        "Use direct but respectful language.",
        "Connect ideas to identity, goals, and real-world consequences.",
        "Name the concept clearly after the hook lands.",
      ],
      avoidPatterns: [
        "Avoid sounding childish.",
        "Avoid unnecessary lecturing.",
      ],
      quizStyle: [
        "Use challenge-based questions.",
        "Mix explanation, application, and short retrieval checks.",
      ],
      encouragementStyle: [
        "Recognize progress and autonomy.",
        "Use coaching language instead of praise-only language.",
      ],
    }),
    university: gradeLanguagePolicySchema.parse({
      gradeBand,
      preferredSentenceLength: "medium",
      explanationStyle: [
        "Respect the learner's independence.",
        "Use precise terminology, but define it when needed.",
        "Connect theory to practice and critique.",
      ],
      avoidPatterns: [
        "Avoid oversimplifying complex tradeoffs.",
        "Avoid patronizing tone.",
      ],
      quizStyle: [
        "Use applied reasoning and self-explanation prompts.",
        "Surface misconceptions explicitly.",
      ],
      encouragementStyle: [
        "Use peer-level collaborative tone.",
        "Emphasize mastery and transfer.",
      ],
    }),
  };

  return policyByBand[gradeBand];
}

export function shouldUseWebOpening(params: {
  subject?: string | null;
  topicTitle: string;
  topicDescription?: string | null;
  boundary?: TopicSourceBoundary | null;
}) {
  if (params.boundary?.webOpeningEnabled === false) {
    return false;
  }

  const corpus = [
    normalizeText(params.subject),
    normalizeText(params.topicTitle),
    normalizeText(params.topicDescription),
  ].join(" ");

  return WEB_FIRST_SUBJECT_KEYWORDS.some((keyword) => corpus.includes(keyword));
}

function pickPersonalizationFrame(profile: StudentInterestProfile) {
  if (profile.contextTags.length > 0) {
    return profile.contextTags[0]!;
  }

  if (profile.primaryInterests.length > 0) {
    return profile.primaryInterests[0]!.label;
  }

  if (profile.curiosityAreas.length > 0) {
    return profile.curiosityAreas[0]!;
  }

  return "real-world relevance";
}

export function buildSessionOpeningPlan(params: {
  subject?: string | null;
  topicTitle: string;
  topicDescription?: string | null;
  studentProfile: StudentInterestProfile;
  boundary?: TopicSourceBoundary | null;
}): SessionOpeningPlan {
  const webEnabled = shouldUseWebOpening(params);
  const personalizationFrame = pickPersonalizationFrame(
    params.studentProfile,
  );
  const bridgeConcept = params.topicTitle.trim();
  const searchQueries = webEnabled
    ? [
        `recent real world event that illustrates ${params.topicTitle}`,
        `recent application of ${params.topicTitle} helping people`,
      ]
    : [];

  return sessionOpeningPlanSchema.parse({
    strategy: webEnabled ? "web_event" : "crafted_story",
    personalizationFrame,
    bridgeConcept,
    invitationGoal: `Make the student want to understand ${params.topicTitle} next.`,
    suggestedSearchQueries: searchQueries,
    rationale: webEnabled
      ? "The topic has strong real-world hooks, so the opening should try a recent event or application first."
      : "The topic is better introduced with a crafted story, thought experiment, or surprising fact.",
  });
}

export function buildTutorGroundingRules(params: {
  gradeBand: GradeBand;
  topicTitle: string;
  learningOutcomes: string[];
  boundary?: TopicSourceBoundary | null;
  studentProfile: StudentInterestProfile;
}) {
  const policy = getGradeLanguagePolicy(params.gradeBand);
  const boundary = topicSourceBoundarySchema.parse(params.boundary ?? {});
  const personalizationFrame = pickPersonalizationFrame(params.studentProfile);

  return {
    runtimeMode: "hybrid" as const,
    languagePolicy: policy,
    personalizationFrame,
    systemRules: [
      `Explain and quiz only within the teacher-defined learning outcomes for ${params.topicTitle}.`,
      `Treat teacher material as the source of factual truth. If the material does not support a claim, say so clearly.`,
      boundary.hallucinationPolicy,
      "Use the student's profile only to personalize framing and motivation, never to expose private details in teacher reports.",
    ],
    learningOutcomes: params.learningOutcomes,
  };
}

export function buildTeacherSafeProfileView(
  profile: StudentInterestProfile,
): Pick<StudentInterestProfile, "contextTags" | "lastUpdated"> {
  return {
    contextTags: profile.contextTags,
    lastUpdated: profile.lastUpdated,
  };
}
