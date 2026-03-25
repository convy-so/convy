import { nanoid } from "nanoid";

import type { CoveragePlan, ResearchBrief } from "./types";
import type {
  FeedbackDimension,
  FeedbackIssue,
  SampleConductingProfile,
  SampleFeedbackEntryInput,
  SampleFeedbackPatch,
  SampleRequestedChange,
} from "./sample-feedback";
import { buildCoveragePlan } from "./creation-workflow";

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(lead|steer|push)\b/i, reason: "Feedback cannot ask the interviewer to steer participants toward a preferred answer." },
  { pattern: /\b(skip|avoid|ignore)\b.{0,20}\b(barrier|risk|problem|hard|negative)\b/i, reason: "Feedback cannot remove difficult but necessary evidence-seeking topics." },
  { pattern: /\b(convince|persuade|sell)\b/i, reason: "The interviewer must stay neutral rather than persuasive." },
  { pattern: /\bunprofessional\b|\bslang\b|\bcasual to the point\b/i, reason: "Feedback cannot intentionally reduce professionalism." },
];

const VAGUE_PATTERNS = [
  /\bbe friendly\b/i,
  /\bmake it better\b/i,
  /\bsound normal\b/i,
  /\bless weird\b/i,
  /\bmore human\b/i,
];

const ISSUE_TO_DIMENSION: Partial<Record<FeedbackIssue, FeedbackDimension>> = {
  too_formal: "tone",
  too_robotic: "realism",
  too_long: "question_length",
  compound_questions: "question_length",
  weak_probing: "probe_depth",
  over_probing: "probe_depth",
  missed_topic: "topic_coverage",
  felt_unrealistic: "realism",
  too_blunt: "participant_comfort",
  too_vague: "clarity",
  not_student_friendly: "warmth",
  not_professional_enough: "professionalism",
};

function normalizeText(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n")
    .trim();
}

function inferStrength(input: SampleFeedbackEntryInput) {
  switch (input.impactLevel) {
    case "minor_phrase":
      return "light" as const;
    case "research_change":
      return "strong" as const;
    default:
      return "moderate" as const;
  }
}

function buildInstruction(dimension: FeedbackDimension, input: SampleFeedbackEntryInput): string {
  const desired = input.desiredChange.trim();
  switch (dimension) {
    case "tone":
      return desired || "Use warmer, more natural language without losing professional boundaries.";
    case "warmth":
      return desired || "Acknowledge participant effort briefly and use more supportive transitions.";
    case "professionalism":
      return desired || "Keep the interview respectful, credible, and appropriate for an education setting.";
    case "clarity":
      return desired || "Use simpler wording and clearer question framing.";
    case "question_length":
      return desired || "Ask shorter questions and avoid stacking multiple ideas together.";
    case "probe_depth":
      return desired || "Use one more follow-up when evidence is thin before switching topics.";
    case "pace":
      return desired || "Move at a steadier pace and avoid topic hopping.";
    case "opening_style":
      return desired || "Use a softer opening before the first substantive question.";
    case "closing_style":
      return desired || "Close with a natural, appreciative wrap-up once enough evidence is covered.";
    case "topic_coverage":
      return desired || "Add coverage for an important missing topic.";
    case "topic_order":
      return desired || "Reorder topics so the conversation feels more natural.";
    case "realism":
      return desired || "Sound less scripted and more like a skilled human interviewer.";
    case "participant_comfort":
      return desired || "Reduce bluntness and protect participant comfort while keeping questions specific.";
  }
}

function buildRequestedChanges(input: SampleFeedbackEntryInput): SampleRequestedChange[] {
  const allDimensions = Array.from(
    new Set([
      ...input.selectedDimensions,
      ...input.selectedIssues.map((issue) => ISSUE_TO_DIMENSION[issue]).filter(Boolean) as FeedbackDimension[],
    ]),
  );

  return allDimensions.map((dimension) => ({
    dimension,
    instruction: buildInstruction(dimension, input),
    strength: inferStrength(input),
    rationale:
      input.selectedIssues.length > 0
        ? `Requested because the creator observed: ${input.selectedIssues.join(", ")}.`
        : "Requested directly by the creator during sample review.",
  }));
}

function inferClassification(input: SampleFeedbackEntryInput, requestedChanges: SampleRequestedChange[]) {
  const hasDesignDimension = requestedChanges.some((change) =>
    change.dimension === "topic_coverage" || change.dimension === "topic_order",
  );
  const hasStyleDimension = requestedChanges.some((change) =>
    change.dimension !== "topic_coverage" && change.dimension !== "topic_order",
  );

  if (input.impactLevel === "research_change" && hasDesignDimension && hasStyleDimension) return "mixed" as const;
  if (input.impactLevel === "research_change" || hasDesignDimension) return "design" as const;
  if (hasStyleDimension) return "style" as const;
  return "invalid" as const;
}

export function compileSampleFeedback(input: SampleFeedbackEntryInput): SampleFeedbackPatch {
  const normalizedFeedback = normalizeText(input.desiredChange, input.exampleQuestion, input.freeText);
  const requestedChanges = buildRequestedChanges(input);
  const blockedReasons = BLOCKED_PATTERNS
    .filter(({ pattern }) => pattern.test(normalizedFeedback))
    .map(({ reason }) => reason);

  const tooVague =
    requestedChanges.length === 0 ||
    (normalizedFeedback.length < 18 && input.selectedDimensions.length === 0) ||
    VAGUE_PATTERNS.some((pattern) => pattern.test(normalizedFeedback));

  const classification = inferClassification(input, requestedChanges);
  const briefPatch =
    classification === "design" || classification === "mixed"
      ? {
          addRequiredTopics:
            input.desiredChange.trim().length > 0 && requestedChanges.some((change) => change.dimension === "topic_coverage")
              ? [input.desiredChange.trim()]
              : [],
          note: input.desiredChange.trim(),
        }
      : null;

  if (blockedReasons.length > 0) {
    return {
      classification,
      confidence: 0.9,
      requiresClarification: false,
      blockedReasons,
      requestedChanges,
      approvedChanges: [],
      rejectedChanges: requestedChanges,
      briefPatch: null,
      status: "rejected",
      summary: "The requested change would weaken survey quality or professionalism, so it was not applied.",
    };
  }

  if (tooVague) {
    return {
      classification,
      confidence: 0.55,
      requiresClarification: true,
      clarificationQuestion:
        "Tell us what should change in practice. For example: shorter questions, warmer openings, more probing before changing topic, or add a topic about mentor support.",
      blockedReasons: [],
      requestedChanges,
      approvedChanges: [],
      rejectedChanges: [],
      briefPatch: null,
      status: "clarification_needed",
      summary: "The feedback is too vague to apply safely without clarification.",
    };
  }

  const approvedChanges = requestedChanges.filter((change) => {
    if (classification === "style") return true;
    if (change.dimension === "topic_coverage" || change.dimension === "topic_order") return true;
    return true;
  });

  const rejectedChanges = requestedChanges.filter((change) => !approvedChanges.includes(change));
  const status =
    rejectedChanges.length > 0 && approvedChanges.length > 0
      ? "partially_approved"
      : approvedChanges.length > 0
        ? "approved"
        : "rejected";

  return {
    classification,
    confidence: classification === "style" ? 0.83 : 0.76,
    requiresClarification: false,
    blockedReasons: [],
    requestedChanges,
    approvedChanges,
    rejectedChanges,
    briefPatch:
      briefPatch && briefPatch.addRequiredTopics.length > 0
        ? briefPatch
        : classification === "design" || classification === "mixed"
          ? { addRequiredTopics: [], note: input.desiredChange.trim() }
          : null,
    status,
    summary:
      classification === "style"
        ? "Approved rehearsal behavior adjustments for the interviewer."
        : classification === "design"
          ? "Approved a survey design adjustment and updated the study coverage."
          : "Applied safe interviewing changes and kept the design-related request for structured coverage updates.",
  };
}

export function buildConductingProfileFromPatch(params: {
  patchId: string;
  mode: "sample" | "live";
  version: number;
  patch: SampleFeedbackPatch;
  baseProfile?: SampleConductingProfile | null;
}): SampleConductingProfile {
  const profile: SampleConductingProfile = {
    version: params.version,
    mode: params.mode,
    sourcePatchId: params.patchId,
    summary: params.patch.summary,
    toneDirectives: [...(params.baseProfile?.toneDirectives || [])],
    questionDirectives: [...(params.baseProfile?.questionDirectives || [])],
    probeDirectives: [...(params.baseProfile?.probeDirectives || [])],
    openingDirectives: [...(params.baseProfile?.openingDirectives || [])],
    closingDirectives: [...(params.baseProfile?.closingDirectives || [])],
    coverageDirectives: [...(params.baseProfile?.coverageDirectives || [])],
    blockedNotes: [...(params.baseProfile?.blockedNotes || []), ...params.patch.blockedReasons],
    createdAt: new Date().toISOString(),
  };

  for (const change of params.patch.approvedChanges) {
    switch (change.dimension) {
      case "tone":
      case "warmth":
      case "professionalism":
      case "participant_comfort":
      case "realism":
        profile.toneDirectives.push(change.instruction);
        break;
      case "clarity":
      case "question_length":
      case "pace":
        profile.questionDirectives.push(change.instruction);
        break;
      case "probe_depth":
        profile.probeDirectives.push(change.instruction);
        break;
      case "opening_style":
        profile.openingDirectives.push(change.instruction);
        break;
      case "closing_style":
        profile.closingDirectives.push(change.instruction);
        break;
      case "topic_coverage":
      case "topic_order":
        profile.coverageDirectives.push(change.instruction);
        break;
    }
  }

  profile.toneDirectives = Array.from(new Set(profile.toneDirectives));
  profile.questionDirectives = Array.from(new Set(profile.questionDirectives));
  profile.probeDirectives = Array.from(new Set(profile.probeDirectives));
  profile.openingDirectives = Array.from(new Set(profile.openingDirectives));
  profile.closingDirectives = Array.from(new Set(profile.closingDirectives));
  profile.coverageDirectives = Array.from(new Set(profile.coverageDirectives));
  profile.blockedNotes = Array.from(new Set(profile.blockedNotes));

  return profile;
}

export function applyFeedbackBriefPatch(params: {
  surveyId: string;
  brief: ResearchBrief;
  currentPlan: CoveragePlan;
  patch: SampleFeedbackPatch;
}) {
  if (!params.patch.briefPatch || params.patch.briefPatch.addRequiredTopics.length === 0) {
    return { brief: params.brief, plan: params.currentPlan, updated: false };
  }

  const requestedTopics = params.patch.briefPatch.addRequiredTopics
    .map((topic) => topic.trim())
    .filter(Boolean);
  const newTopics = requestedTopics.filter((topic) => !params.brief.requiredTopics.includes(topic));
  const nextTopics = Array.from(new Set([...params.brief.requiredTopics, ...newTopics]));

  if (newTopics.length === 0) {
    return { brief: params.brief, plan: params.currentPlan, updated: false };
  }

  const nextBrief: ResearchBrief = {
    ...params.brief,
    requiredTopics: nextTopics,
  };

  const rebuilt = buildCoveragePlan(params.surveyId, nextBrief);
  const customNodes = newTopics
    .map((topic, index) => ({
      id: `custom-${nanoid(6)}-${index + 1}`,
      label: topic,
      description: `Capture evidence related to: ${topic}.`,
      priority: 0.78,
      completionThreshold: 0.7,
      requiredEvidenceTypes: ["quote", "behavioral-example"],
      probeFamilies: ["follow_up", "clarification"],
      isRequired: true,
    }));

  const nextPlan: CoveragePlan = {
    ...rebuilt,
    version: params.currentPlan.version + 1,
    nodes: [...params.currentPlan.nodes, ...customNodes],
    completionRule: params.currentPlan.completionRule,
  };

  return { brief: nextBrief, plan: nextPlan, updated: true };
}
