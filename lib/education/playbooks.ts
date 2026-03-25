import { z } from "zod";

export const playbookPhaseSchema = z.enum(["creation", "conducting", "analytics"]);
export const playbookScopeSchema = z.enum(["survey", "workspace"]);
export const playbookStatusSchema = z.enum([
  "draft",
  "needs_clarification",
  "preview_ready",
  "approved",
  "archived",
]);

export const playbookAuthorInputSchema = z.object({
  name: z.string().min(3),
  phase: playbookPhaseSchema,
  scope: playbookScopeSchema,
  objective: z.string().default(""),
  targetAudience: z.string().default(""),
  desiredStyle: z.string().default(""),
  wordingToUse: z.array(z.string()).default([]),
  wordingToAvoid: z.array(z.string()).default([]),
  examplePhrasings: z.array(z.string()).default([]),
  extraContext: z.string().default(""),
});

export type PlaybookAuthorInput = z.infer<typeof playbookAuthorInputSchema>;

export const derivedMetricDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  theme: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).optional(),
  nodeId: z.string().optional(),
  description: z.string().default(""),
});

export type DerivedMetricDefinition = z.infer<typeof derivedMetricDefinitionSchema>;

export const playbookInterpretationSchema = z.object({
  summary: z.string(),
  purpose: z.string(),
  intendedAudience: z.string().default(""),
  styleDirectives: z.array(z.string()).default([]),
  wordingPreferences: z.array(z.string()).default([]),
  avoidRules: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  derivedMetrics: z.array(derivedMetricDefinitionSchema).default([]),
  guardrailsPreserved: z.array(z.string()).default([]),
  blockedReasons: z.array(z.string()).default([]),
  clarificationQuestions: z.array(z.string()).default([]),
  usefulnessScore: z.number().min(0).max(1).default(0),
  specificityScore: z.number().min(0).max(1).default(0),
  likelyImpact: z.enum(["low", "medium", "high"]).default("medium"),
});

export type PlaybookInterpretation = z.infer<typeof playbookInterpretationSchema>;

export const playbookPreviewSchema = z.object({
  originalIntent: z.string(),
  interpretedEffect: z.array(z.string()).default([]),
  unchangedGuardrails: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});

export type PlaybookPreview = z.infer<typeof playbookPreviewSchema>;

export const playbookVersionRecordSchema = z.object({
  id: z.string(),
  playbookId: z.string(),
  version: z.number().int().positive(),
  status: playbookStatusSchema,
  input: playbookAuthorInputSchema,
  interpretation: playbookInterpretationSchema,
  preview: playbookPreviewSchema,
  createdBy: z.string(),
  approvedBy: z.string().nullable().default(null),
  createdAt: z.string(),
  approvedAt: z.string().nullable().default(null),
});

export type PlaybookVersionRecord = z.infer<typeof playbookVersionRecordSchema>;

export const playbookRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  phase: playbookPhaseSchema,
  scope: playbookScopeSchema,
  surveyId: z.string().nullable().default(null),
  organizationId: z.string().nullable().default(null),
  createdBy: z.string(),
  activeVersionId: z.string().nullable().default(null),
  latestVersion: z.number().int().nonnegative().default(0),
  status: playbookStatusSchema,
  isAttached: z.boolean().default(false),
});

export type PlaybookRecord = z.infer<typeof playbookRecordSchema>;

export const personalityPresetIdSchema = z.enum([
  "balanced_researcher",
  "warm_encourager",
  "crisp_professional",
  "youth_friendly_guide",
  "deep_probe_interviewer",
]);

export type PersonalityPresetId = z.infer<typeof personalityPresetIdSchema>;

export const personalityPresetSchema = z.object({
  id: personalityPresetIdSchema,
  label: z.string(),
  description: z.string(),
  toneDirectives: z.array(z.string()).default([]),
  openingDirectives: z.array(z.string()).default([]),
  questionDirectives: z.array(z.string()).default([]),
  probeDirectives: z.array(z.string()).default([]),
  closingDirectives: z.array(z.string()).default([]),
  avoidPhrases: z.array(z.string()).default([]),
});

export type PersonalityPreset = z.infer<typeof personalityPresetSchema>;

export const personalityOverlaySchema = z.object({
  summary: z.string().default(""),
  toneDirectives: z.array(z.string()).default([]),
  openingDirectives: z.array(z.string()).default([]),
  questionDirectives: z.array(z.string()).default([]),
  probeDirectives: z.array(z.string()).default([]),
  closingDirectives: z.array(z.string()).default([]),
});

export type PersonalityOverlay = z.infer<typeof personalityOverlaySchema>;

export const surveyPersonalityAssignmentSchema = z.object({
  version: z.number().int().positive(),
  mode: z.enum(["sample", "live"]),
  presetId: personalityPresetIdSchema,
  overlay: personalityOverlaySchema,
  createdAt: z.string(),
});

export type SurveyPersonalityAssignment = z.infer<typeof surveyPersonalityAssignmentSchema>;

export const researchBriefPatchSchema = z.object({
  setFields: z.record(z.string(), z.any()).default({}),
  addRequiredTopics: z.array(z.string()).default([]),
  removeRequiredTopics: z.array(z.string()).default([]),
  addSuccessCriteria: z.array(z.string()).default([]),
  removeSuccessCriteria: z.array(z.string()).default([]),
  addAnalysisQuestions: z.array(z.string()).default([]),
  removeAnalysisQuestions: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export type ResearchBriefPatch = z.infer<typeof researchBriefPatchSchema>;

export const refinementProposalTypeSchema = z.enum([
  "conducting_profile",
  "brief_patch",
  "personality_overlay",
  "playbook_draft",
]);

export const refinementProposalSchema = z.object({
  id: z.string(),
  type: refinementProposalTypeSchema,
  title: z.string(),
  originalRequest: z.string(),
  interpretation: z.string(),
  runtimeEffect: z.array(z.string()).default([]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  payload: z.record(z.string(), z.any()).default({}),
});

export type RefinementProposal = z.infer<typeof refinementProposalSchema>;

export const refinementMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export type RefinementMessage = z.infer<typeof refinementMessageSchema>;

export const PLAYBOOK_GUARDRAILS = [
  "Do not override study validation, routing, or coverage enforcement.",
  "Do not lead participants toward preferred answers.",
  "Do not reduce professionalism or participant respect.",
  "Do not change raw analytics truth or deterministic counts.",
] as const;

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  {
    id: "balanced_researcher",
    label: "Balanced Researcher",
    description: "Neutral, practical, and evidence-seeking.",
    toneDirectives: ["Stay warm but neutral.", "Sound like a careful researcher rather than a sales script."],
    openingDirectives: ["Open with a concise orientation and a calm first question."],
    questionDirectives: ["Prefer clear, medium-length questions."],
    probeDirectives: ["Probe once or twice when evidence is thin, then move on."],
    closingDirectives: ["Close with a brief appreciative wrap-up."],
    avoidPhrases: ["amazing", "perfect", "obviously"],
  },
  {
    id: "warm_encourager",
    label: "Warm Encourager",
    description: "Supportive and reassuring while staying professional.",
    toneDirectives: ["Use warmer acknowledgements.", "Keep the tone supportive without becoming casual."],
    openingDirectives: ["Start with a reassuring opening before the first substantive question."],
    questionDirectives: ["Use simpler phrasing and avoid stiff institutional language."],
    probeDirectives: ["Use gentle follow-ups that invite examples."],
    closingDirectives: ["End with a warm thank you."],
    avoidPhrases: ["interrogate", "justify"],
  },
  {
    id: "crisp_professional",
    label: "Crisp Professional",
    description: "Direct, concise, and polished.",
    toneDirectives: ["Keep the tone formal but not cold."],
    openingDirectives: ["Open quickly and move into the first precise question."],
    questionDirectives: ["Prefer short, sharply framed questions."],
    probeDirectives: ["Use efficient follow-ups focused on evidence."],
    closingDirectives: ["Close cleanly once enough evidence is gathered."],
    avoidPhrases: ["super", "kind of", "sort of"],
  },
  {
    id: "youth_friendly_guide",
    label: "Youth-Friendly Guide",
    description: "Plain language and lower-friction phrasing for student audiences.",
    toneDirectives: ["Use plain, accessible language.", "Keep the tone respectful and lightly conversational."],
    openingDirectives: ["Start with a low-pressure opening."],
    questionDirectives: ["Avoid jargon and stacked clauses."],
    probeDirectives: ["Use concrete, example-seeking follow-ups."],
    closingDirectives: ["Close with a simple thank you and short wrap-up."],
    avoidPhrases: ["leverage", "utilize", "stakeholder"],
  },
  {
    id: "deep_probe_interviewer",
    label: "Deep Probe Interviewer",
    description: "More persistent follow-ups while preserving comfort and neutrality.",
    toneDirectives: ["Stay composed and neutral."],
    openingDirectives: ["Set expectations that concrete examples are helpful."],
    questionDirectives: ["Use precise questions that make examples easy to give."],
    probeDirectives: ["Stay on the same topic slightly longer to get concrete evidence."],
    closingDirectives: ["Close only after the required evidence is materially covered."],
    avoidPhrases: ["let's just assume", "you probably"],
  },
];

export function getPersonalityPreset(presetId?: PersonalityPresetId | null) {
  return (
    PERSONALITY_PRESETS.find((preset) => preset.id === presetId) ??
    PERSONALITY_PRESETS[0]
  );
}

export function renderPlaybookContext(playbooks: Array<{
  name: string;
  phase: string;
  scope: string;
  interpretation: PlaybookInterpretation;
}>) {
  if (playbooks.length === 0) return "";
  return playbooks
    .map((playbook) => [
      `- ${playbook.name} (${playbook.scope})`,
      `  Purpose: ${playbook.interpretation.purpose}`,
      ...playbook.interpretation.styleDirectives.map((item) => `  Style: ${item}`),
      ...playbook.interpretation.wordingPreferences.map((item) => `  Prefer: ${item}`),
      ...playbook.interpretation.avoidRules.map((item) => `  Avoid: ${item}`),
    ].join("\n"))
    .join("\n");
}

export function renderPersonalityContext(
  preset: PersonalityPreset,
  overlay?: PersonalityOverlay | null,
) {
  const sections = [
    ...preset.toneDirectives.map((item) => `- Tone: ${item}`),
    ...preset.openingDirectives.map((item) => `- Opening: ${item}`),
    ...preset.questionDirectives.map((item) => `- Question style: ${item}`),
    ...preset.probeDirectives.map((item) => `- Probing: ${item}`),
    ...preset.closingDirectives.map((item) => `- Closing: ${item}`),
    ...preset.avoidPhrases.map((item) => `- Avoid phrase: ${item}`),
    ...(overlay?.toneDirectives ?? []).map((item) => `- Overlay tone: ${item}`),
    ...(overlay?.openingDirectives ?? []).map((item) => `- Overlay opening: ${item}`),
    ...(overlay?.questionDirectives ?? []).map((item) => `- Overlay question style: ${item}`),
    ...(overlay?.probeDirectives ?? []).map((item) => `- Overlay probing: ${item}`),
    ...(overlay?.closingDirectives ?? []).map((item) => `- Overlay closing: ${item}`),
  ];
  return sections.join("\n");
}
