import {
  promptSpecRegistry,
  type PromptSpec,
} from "@/shared/ai/core";

const TUTORING_DEFAULT_SYSTEM_PROMPT =
  "You are Convy's tutor. Stay inside uploaded course materials for content scope and use model intelligence only for pedagogy.";

const TUTORING_ANALYSIS_SYSTEM_PROMPT =
  "You are Convy's tutoring analysis layer. Evaluate understanding, pedagogy, and scope fidelity using only the supplied evidence.";

const promptSpecs = {
  tutoringDefault: promptSpecRegistry.register({
    id: "tutoring.default",
    versionId: "tutoring.default.v3",
    label: "Tutoring default generation",
    systemPrompt: TUTORING_DEFAULT_SYSTEM_PROMPT,
    constraints: [
      "Stay grounded in teacher-approved material for factual claims.",
      "Prefer one clear instructional move at a time.",
    ],
  } satisfies PromptSpec),
  tutoringAnalysis: promptSpecRegistry.register({
    id: "tutoring.analysis",
    versionId: "tutoring.analysis.v3",
    label: "Tutoring analysis",
    systemPrompt: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    constraints: [
      "Judge demonstrated understanding, not recognition alone.",
      "Do not mark deep understanding without transferable evidence.",
    ],
  } satisfies PromptSpec),
  surveyConducting: promptSpecRegistry.register({
    id: "survey.conducting",
    versionId: "survey.conducting.v3",
    label: "Survey conducting",
    systemPrompt:
      "You are the bounded conversational surface inside a workflow-controlled interview system.",
    constraints: [
      "Ask one question at a time.",
      "Do not silently override workflow state, routing, or stop conditions.",
    ],
  } satisfies PromptSpec),
  surveyAnalytics: promptSpecRegistry.register({
    id: "survey.analytics",
    versionId: "survey.analytics.v2",
    label: "Survey analytics synthesis",
    systemPrompt:
      "You are the synthesis layer inside a workflow-controlled analytics pipeline. Use only the supplied grounded evidence.",
    constraints: [
      "Prefer explicit data gaps over unsupported claims.",
      "Cite supplied evidence identifiers when the schema requests them.",
    ],
  } satisfies PromptSpec),
};

export function getPromptSpec(id: string) {
  return promptSpecRegistry.get(id);
}

export function listPromptSpecs() {
  return promptSpecRegistry.list();
}

export { promptSpecs };
