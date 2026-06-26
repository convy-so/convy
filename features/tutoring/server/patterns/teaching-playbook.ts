import {
  learningTeachingPlaybookSchema,
  patternConfidenceLabelSchema,
  type LearningTeachingPlaybook,
  type StudentPatternProfile,
} from "@/features/tutoring/server/pattern-types";
import { TUTORING_SUBJECT_DEFAULTS } from "@/shared/tutoring/constants";

import { getPatternConfidenceLabel } from "./pattern-profile-utils";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function isoNow() {
  return new Date().toISOString();
}

export function renderTeachingPlaybookContext(
  playbook: LearningTeachingPlaybook | null | undefined,
) {
  if (!playbook) return "";

  const sections = [
    `Confidence: ${Math.round(playbook.overallConfidence * 100)}% (${playbook.confidenceLabel})`,
    `Behavior weight: ${playbook.behaviorWeight}`,
    playbook.topExplanationApproaches.length > 0
      ? `Preferred explanation approaches:\n${playbook.topExplanationApproaches
          .slice(0, 4)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
    playbook.preferredInterestDomains.length > 0
      ? `High-resonance domains:\n${playbook.preferredInterestDomains
          .slice(0, 4)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
    playbook.cognitiveGuidance.length > 0
      ? `Cognitive guidance:\n${playbook.cognitiveGuidance
          .slice(0, 4)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
    playbook.motivationalGuidance.length > 0
      ? `Motivational guidance:\n${playbook.motivationalGuidance
          .slice(0, 4)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
    playbook.confidenceGuardrails.length > 0
      ? `Confidence guardrails:\n${playbook.confidenceGuardrails
          .slice(0, 4)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
    playbook.relevantMisconceptions.length > 0
      ? `Misconceptions to watch:\n${playbook.relevantMisconceptions
          .slice(0, 3)
          .map((item) => `- ${item.label} (${item.status}): ${item.guidance}`)
          .join("\n")}`
      : null,
    playbook.usedExampleReferences.length > 0
      ? `Avoid repeating examples:\n${playbook.usedExampleReferences
          .slice(-6)
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null,
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function buildTeachingPlaybook(params: {
  globalProfile: StudentPatternProfile | null;
  subjectProfile: StudentPatternProfile | null;
  lessonLocalGaps: string[];
  lessonLocalUsedExamples: string[];
}) {
  const globalConfidence = params.globalProfile?.patternConfidence ?? 0;
  const subjectConfidence = params.subjectProfile?.patternConfidence ?? 0;
  const chosenPrimary =
    subjectConfidence >= globalConfidence ? params.subjectProfile : params.globalProfile;
  const overallConfidence = Math.max(globalConfidence, subjectConfidence);
  const confidenceLabel = patternConfidenceLabelSchema.parse(
    getPatternConfidenceLabel(overallConfidence),
  );
  const behaviorWeight =
    overallConfidence >= 0.7
      ? "primary"
      : overallConfidence >= 0.3
        ? "favored"
        : "supplementary";
  const sourceScopesUsed = uniqueStrings([
    params.globalProfile ? "global" : null,
    params.subjectProfile
      ? `subject:${params.subjectProfile.subjectKey ?? TUTORING_SUBJECT_DEFAULTS.key}`
      : null,
    params.lessonLocalGaps.length > 0 || params.lessonLocalUsedExamples.length > 0
      ? "lesson-local"
      : null,
  ]);

  const topExplanationApproaches = uniqueStrings([
    ...(params.subjectProfile?.explanationApproaches ?? [])
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 2)
      .map((item) => item.type),
    ...(params.globalProfile?.explanationApproaches ?? [])
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 2)
      .map((item) => item.type),
  ]).slice(0, 2);

  const preferredInterestDomains = uniqueStrings([
    ...(params.subjectProfile?.interestResonance.domains ?? [])
      .sort((a, b) => b.comprehensionScore - a.comprehensionScore)
      .slice(0, 3)
      .map((item) => item.domain),
    ...(params.globalProfile?.interestResonance.domains ?? [])
      .sort((a, b) => b.comprehensionScore - a.comprehensionScore)
      .slice(0, 3)
      .map((item) => item.domain),
  ]).slice(0, 3);

  const cognitiveGuidance = uniqueStrings([
    chosenPrimary?.cognitivePattern.primaryStyle === "relational"
      ? "Connect new ideas explicitly to things already covered."
      : null,
    chosenPrimary?.cognitivePattern.primaryStyle === "examples"
      ? "Use concrete examples early before abstraction."
      : null,
    chosenPrimary?.cognitivePattern.primaryStyle === "analytical"
      ? "Break ideas into parts and show the logic chain."
      : null,
    chosenPrimary?.cognitivePattern.primaryStyle === "divergent"
      ? "Leave space for what-if thinking and guide it back gently."
      : null,
    chosenPrimary?.cognitivePattern.averageExplanationAttempts &&
    chosenPrimary.cognitivePattern.averageExplanationAttempts >= 2.5
      ? "Do not rush progression; verify comprehension before deepening."
      : null,
  ]);

  const motivationalGuidance = uniqueStrings([
    chosenPrimary?.motivationalPattern.primaryMotivationalStyle === "competition"
      ? "Competitive framing can increase engagement when used lightly."
      : null,
    chosenPrimary?.motivationalPattern.primaryMotivationalStyle === "collaboration"
      ? "Use collaborative language and shared problem-solving."
      : null,
    chosenPrimary?.motivationalPattern.primaryMotivationalStyle === "future_oriented"
      ? "Link concepts to future goals or outcomes."
      : null,
    chosenPrimary?.motivationalPattern.primaryMotivationalStyle === "present_oriented"
      ? "Anchor ideas in familiar real-world situations first."
      : null,
    chosenPrimary?.motivationalPattern.primaryMotivationalStyle === "autonomy"
      ? "Offer small choices in how to approach the explanation."
      : null,
    ...(chosenPrimary?.motivationalPattern.engagementTriggers ?? []),
  ]).slice(0, 5);

  const confidenceGuardrails = uniqueStrings([
    chosenPrimary?.confidenceMindsetPattern.requiresConfidenceBuilding
      ? "Build confidence explicitly before the hardest checks."
      : null,
    chosenPrimary?.confidenceMindsetPattern.responseWhenWrong === "guarded"
      ? "Normalize mistakes before correction and keep corrections gentle."
      : null,
    params.lessonLocalGaps.length > 0
      ? `Revisit these unresolved gaps before moving fast: ${params.lessonLocalGaps.join("; ")}`
      : null,
  ]);

  const relevantMisconceptions = uniqueStrings([
    ...(params.subjectProfile?.persistentMisconceptions ?? [])
      .filter((item) => item.status !== "single_occurrence")
      .map(
        (item) =>
          `${item.label}: show why the intuitive version feels right, then rebuild the correct mental model.`,
      ),
    ...(params.globalProfile?.persistentMisconceptions ?? [])
      .filter((item) => item.status === "persistent")
      .map(
        (item) =>
          `${item.label}: avoid repeating failed corrections; use a new explanation route.`,
      ),
  ]).map((guidance) => {
    const [label, text] = guidance.split(": ");
    return {
      label,
      status: guidance.includes("new explanation route") ? "persistent" : "recurring",
      guidance: text ?? "",
    };
  });

  const usedExampleReferences = uniqueStrings([
    ...(params.subjectProfile?.interestResonance.usedExamples ?? []),
    ...(params.globalProfile?.interestResonance.usedExamples ?? []),
    ...params.lessonLocalUsedExamples,
  ]).slice(-12);

  const updatedAtCandidates = [
    params.subjectProfile?.updatedAt,
    params.globalProfile?.updatedAt,
  ].filter((value): value is string => Boolean(value));

  return learningTeachingPlaybookSchema.parse({
    overallConfidence,
    confidenceLabel,
    behaviorWeight,
    topExplanationApproaches,
    preferredInterestDomains,
    cognitiveGuidance,
    motivationalGuidance,
    confidenceGuardrails,
    relevantMisconceptions,
    usedExampleReferences,
    sourceScopesUsed,
    updatedAt: updatedAtCandidates[0] ?? isoNow(),
  });
}


