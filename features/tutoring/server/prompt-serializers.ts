import { renderStrictScopePolicyInstructions } from "@/shared/ai/scope-policy";
import type { PatternMemoryState } from "@/features/tutoring/server/pattern-memory-service";
import type { LearningTeachingPlaybook } from "@/features/tutoring/server/pattern-types";
import type {
  ActiveExpertFramework,
  ExpertFrameworkCapabilityGuidance,
  LearningOutcomeDefinition,
  LearningSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/features/tutoring/public-server";
import type { GroundingUnit } from "@/features/tutoring/server/grounding-units";
import { TUTOR_CAPABILITIES } from "@/features/tutoring/server/tutor-capabilities";
import {
  getTutorCapabilityMaxUsesPerTurn,
  getTutorCapabilityPolicy,
  isTutorCapabilityEnabled,
} from "@/features/tutoring/public-server";

type RenderableLearningOutcome = Pick<
  LearningOutcomeDefinition,
  "title" | "description"
>;

type TranscriptMessage = {
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function nonEmpty(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? normalizeLine(value) : ""))
    .filter(Boolean);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function readOptionalRecordString(
  record: Record<string, unknown>,
  key: string,
) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function renderBullets(values: Array<string | null | undefined>, empty = "- none") {
  const lines = dedupe(nonEmpty(values));
  return lines.length ? lines.map((value) => `- ${value}`).join("\n") : empty;
}

export function renderTaggedSection(tag: string, content: string, attributes?: Record<string, string | null | undefined>) {
  const body = content.trim();
  if (!body) return "";

  const attrs = Object.entries(attributes ?? {})
    .flatMap(([key, value]) =>
      value && value.trim()
        ? [`${key}="${value.replace(/"/g, "&quot;")}"`]
        : [],
    )
    .join(" ");

  return attrs.length > 0
    ? `<${tag} ${attrs}>\n${body}\n</${tag}>`
    : `<${tag}>\n${body}\n</${tag}>`;
}

export function buildPromptFrame(input: {
  role: string;
  goal: string;
  constraints: string[];
  outputContract: string[];
  antiRules?: string[];
  scopePolicy?: {
    objective: string;
    activeTopic?: string | null;
    currentPhase?: string | null;
    allowedDetours?: string[];
  } | null;
}) {
  return [
    renderTaggedSection("role", input.role),
    renderTaggedSection("goal", input.goal),
    renderTaggedSection("constraints", renderBullets(input.constraints)),
    input.antiRules?.length
      ? renderTaggedSection("anti_rules", renderBullets(input.antiRules))
      : "",
    renderTaggedSection("output_contract", renderBullets(input.outputContract)),
    input.scopePolicy
      ? renderStrictScopePolicyInstructions(input.scopePolicy)
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderInterestProfile(
  profile: Partial<StudentInterestProfile> | StudentInterestProfile | null | undefined,
) {
  if (!profile) return "No saved interest profile.";

  const primaryInterests = Array.isArray(profile.primaryInterests)
    ? profile.primaryInterests
        .flatMap((item) =>
          item && typeof item === "object" && typeof item.label === "string"
            ? [item.label]
            : [],
        )
    : [];
  const aspirations = Array.isArray(profile.aspirations)
    ? profile.aspirations.filter((item): item is string => typeof item === "string")
    : [];
  const curiosityAreas = Array.isArray(profile.curiosityAreas)
    ? profile.curiosityAreas.filter((item): item is string => typeof item === "string")
    : [];
  const motivationalStyle = Array.isArray(profile.motivationalStyle)
    ? profile.motivationalStyle.filter((item) => typeof item === "string")
    : [];
  const contextTags = Array.isArray(profile.contextTags)
    ? profile.contextTags.filter((item): item is string => typeof item === "string")
    : [];

  return [
    `Primary interests: ${primaryInterests.join(", ") || "none"}`,
    `Aspirations: ${aspirations.join(", ") || "none"}`,
    `Curiosity areas: ${curiosityAreas.join(", ") || "none"}`,
    `Motivational style: ${motivationalStyle.join(", ") || "none"}`,
    `Learning relationship: ${typeof profile.learningRelationship === "string" ? profile.learningRelationship : "unknown"}`,
    `Context tags: ${contextTags.join(", ") || "none"}`,
  ].join("\n");
}

export function renderLearningOutcomes(
  outcomes: ReadonlyArray<RenderableLearningOutcome>,
) {
  return outcomes.length
    ? outcomes
        .map((item) =>
          `- ${normalizeLine(item.title)}${item.description ? `: ${normalizeLine(item.description)}` : ""}`,
        )
        .join("\n")
    : "- none";
}

export function renderCompactSessionState(state: LearningSessionState) {
  return [
    `Turn count: ${state.turnCount}`,
    `Framework: ${state.frameworkId ?? "none"}`,
    `Grounding pack version: ${state.groundingPackVersion}`,
    `Recent summary: ${normalizeLine(state.recentMessageSummary) || "none"}`,
    `Recent evidence:\n${renderBullets(state.recentEvidence.slice(-6))}`,
    `Tutor notes:\n${renderBullets(state.tutorNotes.slice(-4))}`,
  ].join("\n");
}

export function renderConversationWindow(messages: Array<{ role: string; content: string }>, limit = 4) {
  const recent = messages
    .filter((message) => normalizeLine(message.content))
    .slice(-limit);

  return recent.length
    ? recent
        .map(
          (message) =>
            `${message.role === "assistant" ? "Tutor" : "Student"}: ${normalizeLine(message.content)}`,
        )
        .join("\n")
    : "No recent turns.";
}

export function renderMemoryNote(input: {
  playbook: LearningTeachingPlaybook | null;
  memoryState: PatternMemoryState;
}) {
  if (input.playbook) {
    const playbook = input.playbook;
    return [
      `Confidence: ${Math.round(playbook.overallConfidence * 100)}% (${playbook.confidenceLabel})`,
      `Behavior weight: ${playbook.behaviorWeight}`,
      `Explanation approaches:\n${renderBullets(playbook.topExplanationApproaches)}`,
      `Interest domains:\n${renderBullets(playbook.preferredInterestDomains)}`,
      `Cognitive guidance:\n${renderBullets(playbook.cognitiveGuidance)}`,
      `Motivational guidance:\n${renderBullets(playbook.motivationalGuidance)}`,
      `Confidence guardrails:\n${renderBullets(playbook.confidenceGuardrails)}`,
      `Misconceptions to watch:\n${playbook.relevantMisconceptions.length
        ? playbook.relevantMisconceptions
            .map(
              (item) =>
                `- ${item.label} (${item.status}): ${item.guidance}`,
            )
            .join("\n")
        : "- none"}`,
      `Avoid repeating examples:\n${renderBullets(playbook.usedExampleReferences.slice(-6))}`,
    ].join("\n\n");
  }

  return input.memoryState.message?.trim() || "No memory note available.";
}

export function renderFrameworkRuntimeArtifact(activeFramework: ActiveExpertFramework) {
  const framework = activeFramework.framework;
  const canonicalExamples = framework.fewShotExamples
    .map((example) => normalizeLine(example))
    .filter(Boolean)
    .slice(0, 2);
  const capabilityGuidance = framework.capabilityGuidance;

  return [
    `Framework: ${framework.name}`,
    `Description: ${normalizeLine(framework.description) || "none"}`,
    framework.markdownContent.trim()
      ? `Instructions:\n${framework.markdownContent.trim()}`
      : "Instructions: none",
    [
      "Capability policy (authoritative for tool use and overrides any tool references in the framework markdown):",
      TUTOR_CAPABILITIES.map((capability) =>
        renderFrameworkCapabilityPolicyLine(capabilityGuidance, capability.id),
      ).join("\n"),
    ].join("\n"),
    activeFramework.heuristics.length
      ? `Approved heuristics:\n${activeFramework.heuristics
          .map(
            (heuristic) =>
              `- ${heuristic.title}: when ${normalizeLine(heuristic.trigger)}, ${normalizeLine(heuristic.action)}`,
          )
          .join("\n")}`
      : "Approved heuristics: none",
    activeFramework.openConflicts.length
      ? `Open conflicts:\n${activeFramework.openConflicts
          .map((conflict) => `- ${normalizeLine(conflict.summary)}`)
          .join("\n")}`
      : "Open conflicts: none",
    canonicalExamples.length
      ? `Canonical examples:\n${canonicalExamples
          .map((example, index) => `- Example ${index + 1}: ${example}`)
          .join("\n")}`
      : "Canonical examples: none",
  ].join("\n\n");
}

function renderFrameworkCapabilityPolicyLine(
  guidance: ExpertFrameworkCapabilityGuidance,
  capabilityId: (typeof TUTOR_CAPABILITIES)[number]["id"],
) {
  const capability = TUTOR_CAPABILITIES.find((item) => item.id === capabilityId);
  const label = capability ? capability.label : capabilityId;
  const policy = getTutorCapabilityPolicy(guidance, capabilityId);
  const enabled = isTutorCapabilityEnabled(guidance, capabilityId);

  if (capabilityId === "search_image" || capabilityId === "search_video") {
    const maxUsesPerTurn = getTutorCapabilityMaxUsesPerTurn(guidance, capabilityId);
    return enabled
      ? `- ${capabilityId} (${label}): enabled, max ${maxUsesPerTurn} per tutoring response. Policy: ${policy || "missing"}`
      : `- ${capabilityId} (${label}): disabled.`;
  }

  if (capabilityId === "finish_session") {
    return `- ${capabilityId} (${label}): always available. Policy: ${policy || "missing"}`;
  }

  return enabled
    ? `- ${capabilityId} (${label}): enabled. Policy: ${policy || "missing"}`
    : `- ${capabilityId} (${label}): disabled.`;
}

export function renderGroundingUnits(units: GroundingUnit[]) {
  return units.length
    ? units
        .map(
          (unit) =>
            `- [${unit.kind}] ${normalizeLine(unit.title)}: ${normalizeLine(unit.content)}`,
        )
        .join("\n")
    : "- none";
}

export function renderTeacherEvidenceBlocks(input: {
  retrievedEvidence: Array<{
    sourceType: string;
    sourceId: string;
    score?: number;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  uniqueReports: Array<{
    topicTitle: string | null;
    masteryPercent: number | null;
    report: unknown;
  }>;
  uniqueInteractions: Array<{
    topicTitle: string | null;
    role: string;
    interactionType: string;
    content: string;
  }>;
}) {
  const primary = input.retrievedEvidence.length
    ? input.retrievedEvidence
        .slice(0, 6)
        .map((item, index) => {
          const label = `${item.sourceType}:${item.sourceId}`;
          const score =
            typeof item.score === "number" ? ` relevance=${item.score.toFixed(2)}` : "";
          const topic =
            typeof item.metadata?.topicTitle === "string"
              ? ` topic=${normalizeLine(item.metadata.topicTitle)}`
              : "";
          return `${index + 1}. ${label}${score}${topic}\n${normalizeLine(item.content)}`;
        })
        .join("\n\n")
    : "none";

  const reports = input.uniqueReports.length
    ? input.uniqueReports
        .slice(0, 3)
        .map((report, index) => {
          const payload =
            typeof report.report === "object" && report.report !== null
              ? (report.report as Record<string, unknown>)
              : {};
          return [
            `${index + 1}. Topic: ${normalizeLine(report.topicTitle ?? "Unknown topic")}`,
            `Mastery: ${report.masteryPercent ?? "unknown"}`,
            `Student summary: ${
              normalizeLine(readOptionalRecordString(payload, "studentSummary")) || "none"
            }`,
            `Pedagogical summary: ${
              normalizeLine(readOptionalRecordString(payload, "pedagogicalSummary")) || "none"
            }`,
            `Gaps: ${Array.isArray(payload.identifiedGaps) ? payload.identifiedGaps.join("; ") || "none" : "none"}`,
            `Risk flags: ${Array.isArray(payload.riskFlags) ? payload.riskFlags.join("; ") || "none" : "none"}`,
          ].join("\n");
        })
        .join("\n\n")
    : "none";

  const interactions = input.uniqueInteractions.length
    ? input.uniqueInteractions
        .slice(0, 4)
        .map(
          (item, index) =>
            `${index + 1}. ${normalizeLine(item.topicTitle ?? "Unknown topic")} | ${item.role} | ${item.interactionType}\n${normalizeLine(item.content)}`,
        )
        .join("\n\n")
    : "none";

  return {
    primary,
    reports,
    interactions,
  };
}

export function renderTranscript(transcript: TranscriptMessage[], limit?: number) {
  const rows = transcript
    .filter((item) => normalizeLine(item.content))
    .slice(limit ? -limit : 0);

  return rows.length
    ? rows
        .map((item) => `${item.role}: ${normalizeLine(item.content)}`)
        .join("\n")
    : "none";
}

export function renderReportState(state: LearningSessionState, playbook?: Record<string, unknown> | null) {
  const playbookLines =
    playbook && typeof playbook === "object"
      ? Object.entries(playbook)
          .slice(0, 8)
          .map(([key, value]) => `${key}: ${normalizeLine(String(value))}`)
          .join("\n")
      : "none";

  return [
    renderCompactSessionState(state),
    `Personalization context:\n${playbookLines}`,
  ].join("\n\n");
}

export function renderPreviousReport(report: TeacherProgressReport | null | undefined) {
  if (!report) return "No previous report.";

  return [
    `Student summary: ${normalizeLine(report.studentSummary) || "none"}`,
    `Pedagogical summary: ${normalizeLine(report.pedagogicalSummary) || "none"}`,
    `Confidence score: ${report.studentConfidenceScore ?? "unknown"}`,
    `Identified gaps:\n${renderBullets(report.identifiedGaps)}`,
    `Recommended teacher actions:\n${renderBullets(report.recommendedTeacherActions)}`,
  ].join("\n");
}
