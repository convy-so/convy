import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel } from "@/lib/ai";
import { buildPatternSummaryRewritePrompt } from "@/lib/learning/prompts/pattern-summaries";
import {
  buildOnboardingLearningPatternAnalysisPrompt,
  buildSessionLearningPatternAnalysisPrompt,
} from "@/lib/learning/prompts/learning-pattern-analysis";
import {
  learningPatternAnalysisOutputSchema,
  learningTeachingPlaybookSchema,
  patternConfidenceLabelSchema,
  studentLearningPatternProfileSchema,
  type StudentLearningPatternProfile,
  type LearningTeachingPlaybook,
} from "@/lib/learning/pattern-types";
import type {
  LearningSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/lib/learning/types";

const profileSummarySchema = z.object({
  teacherSummary: z.string(),
  studentSummary: z.string(),
});

type MemoryRecord = {
  id?: string;
  memory?: string;
  metadata?: Record<string, unknown>;
};

function isoNow() {
  return new Date().toISOString();
}

export function normalizeSubjectKey(value: string | null | undefined) {
  const normalized = (value ?? "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "general";
}

export function deriveSubjectInfo(params: {
  subjectKey?: string | null;
  subjectLabel?: string | null;
  subject?: string | null;
}) {
  const label = params.subjectLabel?.trim() || params.subject?.trim() || "General";
  const key = normalizeSubjectKey(params.subjectKey || label);

  return {
    subjectKey: key,
    subjectLabel: label,
  };
}

export function confidenceToPercent(confidence: number) {
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

export function getPatternConfidenceLabel(confidence: number) {
  if (confidence >= 0.7) return "well_supported" as const;
  if (confidence >= 0.3) return "emerging" as const;
  return "early" as const;
}

export function buildConfidenceByDimension(profile: StudentLearningPatternProfile) {
  return {
    firstSessionDiscovery: profile.patternConfidence,
    explanationApproaches:
      profile.explanationApproaches[0]?.confidence ?? profile.patternConfidence,
    interestResonance:
      profile.interestResonance.domains[0]?.comprehensionScore ??
      profile.patternConfidence,
    cognitivePattern: profile.cognitivePattern.confidence,
    motivationalPattern: profile.patternConfidence,
    confidenceMindsetPattern:
      profile.confidenceMindsetPattern.requiresConfidenceBuilding ||
      profile.confidenceMindsetPattern.confidenceHistory.length > 0
        ? profile.patternConfidence
        : Math.min(profile.patternConfidence, 0.25),
    persistentMisconceptions:
      profile.persistentMisconceptions.length > 0
        ? Math.max(profile.patternConfidence, 0.35)
        : Math.min(profile.patternConfidence, 0.2),
  };
}

export function defaultLearningPatternProfile(params: {
  scopeType: "global" | "subject";
  subjectKey?: string | null;
  subjectLabel?: string | null;
}) {
  return studentLearningPatternProfileSchema.parse({
    scopeType: params.scopeType,
    subjectKey: params.scopeType === "subject" ? params.subjectKey ?? "general" : null,
    subjectLabel: params.scopeType === "subject" ? params.subjectLabel ?? "General" : null,
    patternConfidence: 0,
    confidenceLabel: "early",
    onboardingObservations: "",
    studentSummary: "",
    teacherSummary: "",
    updatedAt: isoNow(),
  });
}

function formatMemoryRecall(memories: MemoryRecord[]) {
  if (memories.length === 0) return "none";

  return memories
    .slice(0, 20)
    .map((memory, index) => {
      const metadata =
        memory.metadata && Object.keys(memory.metadata).length > 0
          ? JSON.stringify(memory.metadata)
          : "{}";
      return `${index + 1}. ${memory.memory ?? ""}\nmetadata: ${metadata}`;
    })
    .join("\n\n");
}

function formatTranscript(
  messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> | null }>,
) {
  return messages
    .map((message) => {
      const meta =
        message.metadata && Object.keys(message.metadata).length > 0
          ? ` metadata=${JSON.stringify(message.metadata)}`
          : "";
      return `${message.role}${meta}: ${message.content}`;
    })
    .join("\n\n");
}

function sortProfilesForStorage(profiles: StudentLearningPatternProfile[]) {
  return [...profiles].sort((a, b) => {
    if (a.scopeType === b.scopeType) return 0;
    return a.scopeType === "global" ? -1 : 1;
  });
}

function withNormalizedProfile(profile: StudentLearningPatternProfile) {
  const confidence = Math.max(0, Math.min(1, profile.patternConfidence));
  return studentLearningPatternProfileSchema.parse({
    ...profile,
    patternConfidence: confidence,
    confidenceLabel: getPatternConfidenceLabel(confidence),
    updatedAt: profile.updatedAt || isoNow(),
  });
}

export async function analyzeOnboardingLearningPatterns(params: {
  studentName: string;
  studentUserId: string;
  classroomStudentId: string;
  interestProfile: StudentInterestProfile;
  transcript: Array<{ role: string; content: string }>;
  currentProfiles: StudentLearningPatternProfile[];
  relevantMemories: MemoryRecord[];
}) {
  const prompt = buildOnboardingLearningPatternAnalysisPrompt({
    studentName: params.studentName,
    interestProfileJson: JSON.stringify(params.interestProfile),
    currentProfilesJson: JSON.stringify(sortProfilesForStorage(params.currentProfiles)),
    relevantMemoriesText: formatMemoryRecall(params.relevantMemories),
    transcriptText: formatTranscript(params.transcript),
  });

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: learningPatternAnalysisOutputSchema,
    }),
    maxOutputTokens: 1400,
    prompt,
  });

  return {
    profiles: output.profiles.map((profile) =>
      withNormalizedProfile({
        ...profile,
        scopeType: "global",
        subjectKey: null,
        subjectLabel: null,
        patternConfidence: Math.min(profile.patternConfidence, 0.25),
      }),
    ),
    observations: output.observations,
  };
}

export async function analyzeSessionLearningPatterns(params: {
  studentName: string;
  subjectKey: string;
  subjectLabel: string;
  topicTitle: string;
  interestProfile: StudentInterestProfile;
  state: LearningSessionState;
  report: TeacherProgressReport;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  outOfSessionEvidence: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  currentProfiles: StudentLearningPatternProfile[];
  relevantMemories: MemoryRecord[];
}) {
  const prompt = buildSessionLearningPatternAnalysisPrompt({
    studentName: params.studentName,
    subjectKey: params.subjectKey,
    subjectLabel: params.subjectLabel,
    topicTitle: params.topicTitle,
    interestProfileJson: JSON.stringify(params.interestProfile),
    currentProfilesJson: JSON.stringify(sortProfilesForStorage(params.currentProfiles)),
    relevantMemoriesText: formatMemoryRecall(params.relevantMemories),
    reportJson: JSON.stringify(params.report),
    stateJson: JSON.stringify(params.state),
    transcriptText: formatTranscript(params.transcript),
    outOfSessionEvidenceText: formatTranscript(params.outOfSessionEvidence),
  });

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: learningPatternAnalysisOutputSchema,
    }),
    maxOutputTokens: 1800,
    prompt,
  });

  return {
    profiles: output.profiles.map((profile) =>
      withNormalizedProfile(
        profile.scopeType === "subject"
          ? {
              ...profile,
              subjectKey: params.subjectKey,
              subjectLabel: params.subjectLabel,
            }
          : {
              ...profile,
              subjectKey: null,
              subjectLabel: null,
            },
      ),
    ),
    observations: output.observations,
  };
}

export async function rewritePatternSummaries(params: {
  profile: StudentLearningPatternProfile;
  studentName: string;
}) {
  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: profileSummarySchema,
    }),
    prompt: buildPatternSummaryRewritePrompt(params),
  });

  return output;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
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
          .map(
            (item) =>
              `- ${item.label} (${item.status}): ${item.guidance}`,
          )
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
  globalProfile: StudentLearningPatternProfile | null;
  subjectProfile: StudentLearningPatternProfile | null;
  topicLocalGaps: string[];
  topicLocalUsedExamples: string[];
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
      ? `subject:${params.subjectProfile.subjectKey ?? "general"}`
      : null,
    params.topicLocalGaps.length > 0 || params.topicLocalUsedExamples.length > 0
      ? "topic-local"
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
    params.topicLocalGaps.length > 0
      ? `Revisit these unresolved gaps before moving fast: ${params.topicLocalGaps.join("; ")}`
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
      status: guidance.includes("new explanation route")
        ? "persistent"
        : "recurring",
      guidance: text ?? "",
    };
  });

  const usedExampleReferences = uniqueStrings([
    ...(params.subjectProfile?.interestResonance.usedExamples ?? []),
    ...(params.globalProfile?.interestResonance.usedExamples ?? []),
    ...params.topicLocalUsedExamples,
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
