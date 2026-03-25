import { nanoid } from "nanoid";

import { analysisModel, defaultModel, generateAIResponse } from "@/lib/ai";
import type { CoveragePlan, ResearchBrief } from "./types";
import { buildCoveragePlan } from "./creation-workflow";
import type {
  PlaybookAuthorInput,
  PlaybookInterpretation,
  PlaybookPreview,
  RefinementProposal,
  ResearchBriefPatch,
} from "./playbooks";
import {
  PLAYBOOK_GUARDRAILS,
  personalityOverlaySchema,
  playbookInterpretationSchema,
  playbookPreviewSchema,
  refinementProposalSchema,
  researchBriefPatchSchema,
} from "./playbooks";
import type { SampleConductingProfile, SampleRequestedChange } from "./sample-feedback";

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(lead|push|steer|bias)\b/i, reason: "Playbooks cannot steer participants toward preferred answers." },
  { pattern: /\b(skip|avoid|ignore)\b.{0,20}\b(barrier|risk|negative|problem)\b/i, reason: "Playbooks cannot remove necessary evidence-seeking on difficult topics." },
  { pattern: /\b(convince|persuade|sell)\b/i, reason: "Playbooks cannot make the interviewer persuasive." },
  { pattern: /\b(unprofessional|slang)\b/i, reason: "Playbooks cannot intentionally lower professionalism." },
];

function safeJsonParse<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function summarizeIntent(input: PlaybookAuthorInput) {
  return [
    input.objective,
    input.targetAudience,
    input.desiredStyle,
    input.extraContext,
    ...input.examplePhrasings,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function compilePlaybookAuthorInput(input: PlaybookAuthorInput) {
  const rawIntent = summarizeIntent(input);
  const blockedReasons = BLOCKED_PATTERNS
    .filter(({ pattern }) => pattern.test(rawIntent))
    .map(({ reason }) => reason);

  const prompt = `Interpret this guided playbook authoring request for a survey system. Return JSON only.

<input>
Name: ${input.name}
Phase: ${input.phase}
Scope: ${input.scope}
Objective: ${input.objective}
Target audience: ${input.targetAudience}
Desired style: ${input.desiredStyle}
Preferred wording: ${input.wordingToUse.join(", ")}
Avoid wording: ${input.wordingToAvoid.join(", ")}
Example phrasings: ${input.examplePhrasings.join(" || ")}
Extra context: ${input.extraContext}
</input>

<guardrails>
${PLAYBOOK_GUARDRAILS.join("\n")}
</guardrails>

<rules>
- Produce compact, actionable directives.
- Only suggest derived metrics for analytics playbooks, and only if they can be computed from stored facts or snapshot fields.
- Ask for clarification if the input is vague.
- Do not include blocked instructions.
</rules>

<schema>
{
  "summary":"string",
  "purpose":"string",
  "intendedAudience":"string",
  "styleDirectives":["string"],
  "wordingPreferences":["string"],
  "avoidRules":["string"],
  "examples":["string"],
  "derivedMetrics":[{"id":"string","label":"string","theme":"string","sentiment":"positive|negative|neutral|mixed","nodeId":"string","description":"string"}],
  "guardrailsPreserved":["string"],
  "blockedReasons":["string"],
  "clarificationQuestions":["string"],
  "usefulnessScore":0.0,
  "specificityScore":0.0,
  "likelyImpact":"low|medium|high"
}
</schema>`;

  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.2,
    maxTokens: 1400,
  }).catch(() => "");
  const parsed = playbookInterpretationSchema.safeParse(safeJsonParse(raw));

  const interpretation: PlaybookInterpretation = parsed.success
    ? {
        ...parsed.data,
        blockedReasons: Array.from(new Set([...blockedReasons, ...parsed.data.blockedReasons])),
      }
    : {
        summary: input.objective || `${input.phase} playbook`,
        purpose: input.objective || "Refine how this phase behaves for the creator.",
        intendedAudience: input.targetAudience,
        styleDirectives: [input.desiredStyle].filter(Boolean),
        wordingPreferences: input.wordingToUse,
        avoidRules: input.wordingToAvoid,
        examples: input.examplePhrasings,
        derivedMetrics: [],
        guardrailsPreserved: [...PLAYBOOK_GUARDRAILS],
        blockedReasons,
        clarificationQuestions:
          rawIntent.length < 24
            ? ["Add one or two concrete examples of the behavior or phrasing you want."]
            : [],
        usefulnessScore: rawIntent.length > 24 ? 0.65 : 0.35,
        specificityScore: rawIntent.length > 24 ? 0.6 : 0.3,
        likelyImpact: rawIntent.length > 60 ? "medium" : "low",
      };

  const preview = buildPlaybookPreview(input, interpretation);
  const status =
    interpretation.blockedReasons.length > 0
      ? "needs_clarification"
      : interpretation.clarificationQuestions.length > 0
        ? "needs_clarification"
        : "preview_ready";

  return { interpretation, preview, status };
}

export function buildPlaybookPreview(
  input: PlaybookAuthorInput,
  interpretation: PlaybookInterpretation,
): PlaybookPreview {
  return playbookPreviewSchema.parse({
    originalIntent: summarizeIntent(input),
    interpretedEffect: [
      ...interpretation.styleDirectives.slice(0, 3),
      ...interpretation.wordingPreferences.slice(0, 2).map((item) => `Prefer phrasing like: ${item}`),
      ...interpretation.avoidRules.slice(0, 2).map((item) => `Avoid phrasing like: ${item}`),
    ].slice(0, 5),
    unchangedGuardrails: interpretation.guardrailsPreserved.length > 0
      ? interpretation.guardrailsPreserved
      : [...PLAYBOOK_GUARDRAILS],
    examples:
      interpretation.examples.length > 0
        ? interpretation.examples.slice(0, 3)
        : [
            input.phase === "creation"
              ? "Example creation question: What decision should this study help you make once the results are in?"
              : input.phase === "conducting"
                ? "Example conducting question: Can you walk me through one specific moment when that happened?"
                : "Example analytics framing: Learners consistently linked mentor support to confidence in applying the training.",
          ],
  });
}

export function buildConductingProfileFromProposal(params: {
  version: number;
  mode: "sample" | "live";
  summary: string;
  sourcePatchId: string;
  changes: SampleRequestedChange[];
  baseProfile?: SampleConductingProfile | null;
}) {
  const profile: SampleConductingProfile = {
    version: params.version,
    mode: params.mode,
    sourcePatchId: params.sourcePatchId,
    summary: params.summary,
    toneDirectives: [...(params.baseProfile?.toneDirectives ?? [])],
    questionDirectives: [...(params.baseProfile?.questionDirectives ?? [])],
    probeDirectives: [...(params.baseProfile?.probeDirectives ?? [])],
    openingDirectives: [...(params.baseProfile?.openingDirectives ?? [])],
    closingDirectives: [...(params.baseProfile?.closingDirectives ?? [])],
    coverageDirectives: [...(params.baseProfile?.coverageDirectives ?? [])],
    blockedNotes: [...(params.baseProfile?.blockedNotes ?? [])],
    createdAt: new Date().toISOString(),
  };

  for (const change of params.changes) {
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

  return profile;
}

export function applyResearchBriefPatch(params: {
  surveyId: string;
  brief: ResearchBrief;
  currentPlan: CoveragePlan;
  patch: ResearchBriefPatch;
}) {
  const nextBrief: ResearchBrief = {
    ...params.brief,
    ...(params.patch.setFields as Partial<ResearchBrief>),
    requiredTopics: Array.from(
      new Set([
        ...params.brief.requiredTopics.filter((topic) => !params.patch.removeRequiredTopics.includes(topic)),
        ...params.patch.addRequiredTopics,
      ]),
    ),
    successCriteria: Array.from(
      new Set([
        ...params.brief.successCriteria.filter((item) => !params.patch.removeSuccessCriteria.includes(item)),
        ...params.patch.addSuccessCriteria,
      ]),
    ),
    analysisQuestions: Array.from(
      new Set([
        ...params.brief.analysisQuestions.filter((item) => !params.patch.removeAnalysisQuestions.includes(item)),
        ...params.patch.addAnalysisQuestions,
      ]),
    ),
  };

  const rebuiltPlan = buildCoveragePlan(params.surveyId, nextBrief);
  return {
    brief: nextBrief,
    plan: {
      ...rebuiltPlan,
      version: params.currentPlan.version + 1,
      completionRule: params.currentPlan.completionRule,
    },
  };
}

export async function buildRefinementAssistantResponse(input: {
  creatorMessage: string;
  surveyTitle: string;
  currentPersonalityLabel: string;
  playbookSummaries: string[];
  latestSampleTranscript: string;
  brief: ResearchBrief;
}) {
  const prompt = `You are a refinement assistant for a survey creator. Return JSON only.

<context>
Survey title: ${input.surveyTitle}
Current personality: ${input.currentPersonalityLabel}
Active playbooks: ${input.playbookSummaries.join(" | ") || "none"}
Research goal: ${input.brief.researchGoal}
Audience: ${input.brief.audienceDefinition}
Required topics: ${input.brief.requiredTopics.join(", ")}
</context>

<latest-sample>
${input.latestSampleTranscript || "No sample transcript yet."}
</latest-sample>

<creator-request>
${input.creatorMessage}
</creator-request>

<rules>
- If the request is vague, ask one targeted clarifying question and produce no proposals.
- Use proposal types: conducting_profile, brief_patch, personality_overlay, playbook_draft.
- Keep proposals bounded and practical.
- Do not propose anything that reduces rigor or neutrality.
- For brief_patch, only include fields that should change.
- For personality_overlay, keep changes light.
- conducting_profile payload shape:
  {"summary":"string","changes":[{"dimension":"tone|warmth|professionalism|clarity|question_length|probe_depth|pace|opening_style|closing_style|topic_coverage|topic_order|realism|participant_comfort","instruction":"string","strength":"light|moderate|strong","rationale":"string"}]}
- brief_patch payload shape:
  {"setFields":{"field":"value"},"addRequiredTopics":["string"],"removeRequiredTopics":["string"],"addSuccessCriteria":["string"],"removeSuccessCriteria":["string"],"addAnalysisQuestions":["string"],"removeAnalysisQuestions":["string"],"note":"string"}
- personality_overlay payload shape:
  {"presetId":"balanced_researcher|warm_encourager|crisp_professional|youth_friendly_guide|deep_probe_interviewer","overlay":{"summary":"string","toneDirectives":["string"],"openingDirectives":["string"],"questionDirectives":["string"],"probeDirectives":["string"],"closingDirectives":["string"]}}
- playbook_draft payload shape:
  {"name":"string","phase":"creation|conducting|analytics","scope":"survey|workspace","objective":"string","targetAudience":"string","desiredStyle":"string","wordingToUse":["string"],"wordingToAvoid":["string"],"examplePhrasings":["string"],"extraContext":"string"}
</rules>

<schema>
{
  "reply":"string",
  "proposals":[
    {
      "id":"string",
      "type":"conducting_profile|brief_patch|personality_overlay|playbook_draft",
      "title":"string",
      "originalRequest":"string",
      "interpretation":"string",
      "runtimeEffect":["string"],
      "status":"pending",
      "payload":{}
    }
  ]
}
</schema>`;

  const raw = await generateAIResponse(prompt, undefined, {
    model: defaultModel,
    temperature: 0.2,
    maxTokens: 1400,
  }).catch(() => "");
  const parsed = safeJsonParse<{
    reply?: string;
    proposals?: unknown[];
  }>(raw);
  const proposals = Array.isArray(parsed?.proposals)
    ? parsed!.proposals
        .map((proposal) => refinementProposalSchema.safeParse(proposal))
        .filter((result): result is { success: true; data: RefinementProposal } => result.success)
        .map((result) => ({
          ...result.data,
          id: result.data.id || nanoid(),
        }))
    : [];

  return {
    reply:
      parsed?.reply ||
      "Tell me the change you want in practice. For example: shorter questions, a warmer opening, or a topic that is currently missing.",
    proposals,
  };
}

export function normalizeResearchBriefPatch(payload: Record<string, unknown>) {
  return researchBriefPatchSchema.parse(payload);
}

export function normalizePersonalityOverlay(payload: Record<string, unknown>) {
  return personalityOverlaySchema.parse(payload);
}
