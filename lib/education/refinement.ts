import { nanoid } from "nanoid";
import { z } from "zod";

import { defaultModel, generateAIResponse } from "@/lib/ai";

import { buildCoveragePlan } from "./creation-workflow";
import type { SampleConductingProfile, SampleRequestedChange } from "./sample-feedback";
import type { CoveragePlan, ResearchBrief } from "./types";

export const researchBriefPatchSchema = z.object({
  setFields: z.record(z.string(), z.unknown()).default({}),
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
]);

export const refinementProposalSchema = z.object({
  id: z.string(),
  type: refinementProposalTypeSchema,
  title: z.string(),
  originalRequest: z.string(),
  interpretation: z.string(),
  runtimeEffect: z.array(z.string()).default([]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type RefinementProposal = z.infer<typeof refinementProposalSchema>;

export const refinementMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export type RefinementMessage = z.infer<typeof refinementMessageSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function getStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function applyBriefSetFields(
  brief: ResearchBrief,
  setFields: Record<string, unknown>,
): ResearchBrief {
  const nextBrief: ResearchBrief = { ...brief };

  if (typeof setFields.title === "string") nextBrief.title = setFields.title;
  if (typeof setFields.researchGoal === "string") nextBrief.researchGoal = setFields.researchGoal;
  if (typeof setFields.decisionToInform === "string") nextBrief.decisionToInform = setFields.decisionToInform;
  if (typeof setFields.audienceDefinition === "string") nextBrief.audienceDefinition = setFields.audienceDefinition;
  if (typeof setFields.audienceRelationship === "string") nextBrief.audienceRelationship = setFields.audienceRelationship;
  if (typeof setFields.audienceKnowledgeLevel === "string") nextBrief.audienceKnowledgeLevel = setFields.audienceKnowledgeLevel;
  if (typeof setFields.learningContext === "string") nextBrief.learningContext = setFields.learningContext;
  if (typeof setFields.deliveryContext === "string") nextBrief.deliveryContext = setFields.deliveryContext;
  if (typeof setFields.timeWindow === "string") nextBrief.timeWindow = setFields.timeWindow;
  if (typeof setFields.routingRationale === "string") nextBrief.routingRationale = setFields.routingRationale;
  if (typeof setFields.routingConfidence === "number") nextBrief.routingConfidence = setFields.routingConfidence;
  if (typeof setFields.readyForSampling === "boolean") nextBrief.readyForSampling = setFields.readyForSampling;
  if (setFields.tone === "formal" || setFields.tone === "casual" || setFields.tone === "playful" || setFields.tone === "empathetic") {
    nextBrief.tone = setFields.tone;
  }

  const requiredQuestions = getStringArray(setFields.requiredQuestions);
  if (requiredQuestions) nextBrief.requiredQuestions = requiredQuestions;
  const metrics = getStringArray(setFields.metrics);
  if (metrics) nextBrief.metrics = metrics;
  const personalInfo = getStringArray(setFields.personalInfo);
  if (personalInfo) nextBrief.personalInfo = personalInfo;
  const riskFlags = getStringArray(setFields.riskFlags);
  if (riskFlags) nextBrief.riskFlags = riskFlags;
  const constraints = getStringArray(setFields.constraints);
  if (constraints) nextBrief.constraints = constraints;
  const assumptions = getStringArray(setFields.assumptions);
  if (assumptions) nextBrief.assumptions = assumptions;
  const missingFields = getStringArray(setFields.missingFields);
  if (missingFields) nextBrief.missingFields = missingFields;

  return nextBrief;
}

function parseRefinementAssistantResponse(
  value: unknown,
): { reply?: string; proposals?: unknown[] } | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    reply: typeof value.reply === "string" ? value.reply : undefined,
    proposals: Array.isArray(value.proposals) ? value.proposals : undefined,
  };
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
    ...applyBriefSetFields(params.brief, params.patch.setFields),
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
  latestSampleTranscript: string;
  brief: ResearchBrief;
}) {
  const prompt = `You are a refinement assistant for a survey creator. Return JSON only.

<context>
Survey title: ${input.surveyTitle}
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
- Use proposal types: conducting_profile or brief_patch only.
- Keep proposals bounded, practical, and safe.
- Do not reduce rigor, neutrality, or required topic coverage.
- For conducting_profile, focus on how the interviewer behaves during sample and live survey conversations.
- For brief_patch, only include fields that should change.
- conducting_profile payload shape:
  {"summary":"string","changes":[{"dimension":"tone|warmth|professionalism|clarity|question_length|probe_depth|pace|opening_style|closing_style|topic_coverage|topic_order|realism|participant_comfort","instruction":"string","strength":"light|moderate|strong","rationale":"string"}]}
- brief_patch payload shape:
  {"setFields":{"field":"value"},"addRequiredTopics":["string"],"removeRequiredTopics":["string"],"addSuccessCriteria":["string"],"removeSuccessCriteria":["string"],"addAnalysisQuestions":["string"],"removeAnalysisQuestions":["string"],"note":"string"}
</rules>

<schema>
{
  "reply":"string",
  "proposals":[
    {
      "id":"string",
      "type":"conducting_profile|brief_patch",
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

  const parsed = parseRefinementAssistantResponse(safeJsonParse(raw));
  const proposals =
    Array.isArray(parsed?.proposals)
      ? parsed.proposals
          .map((proposal) => refinementProposalSchema.safeParse(proposal))
          .filter(
            (result): result is { success: true; data: RefinementProposal } =>
              result.success,
          )
          .map((result) => ({
            ...result.data,
            id: result.data.id || nanoid(),
          }))
      : [];

  return {
    reply:
      parsed?.reply ||
      "Describe the change you want in practice. For example: shorter questions, a warmer opening, or a topic that is currently missing.",
    proposals,
  };
}

export function normalizeResearchBriefPatch(payload: Record<string, unknown>) {
  return researchBriefPatchSchema.parse(payload);
}
