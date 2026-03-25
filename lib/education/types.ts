import { z } from "zod";
import type { SurveyMedia } from "@/db/schema";

export const EDUCATION_PROGRAM_IDS = [
  "education.course_efficacy",
  "education.learning_outcome",
  "education.institutional_experience",
  "education.professional_development",
] as const;

export type EducationProgramId = (typeof EDUCATION_PROGRAM_IDS)[number];
export type SessionType = "sample" | "live";
export type SessionStatus = "active" | "completed" | "paused" | "flagged";
export type CreationCollectedInfo = Record<string, boolean>;

export const researchBriefSchema = z.object({
  programId: z.enum(EDUCATION_PROGRAM_IDS),
  title: z.string().min(1),
  researchGoal: z.string().min(1),
  decisionToInform: z.string().min(1),
  audienceDefinition: z.string().min(1),
  audienceRelationship: z.string().optional(),
  audienceKnowledgeLevel: z.string().optional(),
  learningContext: z.string().min(1),
  deliveryContext: z.string().min(1),
  timeWindow: z.string().min(1),
  requiredTopics: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  analysisQuestions: z.array(z.string()).default([]),
  requiredQuestions: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  personalInfo: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  tone: z.enum(["formal", "casual", "playful", "empathetic"]).default("casual"),
  media: z.array(z.any()).default([]),
  routingConfidence: z.number().min(0).max(1).default(0),
  routingRationale: z.string().default(""),
  missingFields: z.array(z.string()).default([]),
  readyForSampling: z.boolean().default(false),
});

export type ResearchBrief = z.infer<typeof researchBriefSchema> & { media: SurveyMedia[] };

export const coverageNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  priority: z.number().min(0).max(1),
  completionThreshold: z.number().min(0).max(1),
  requiredEvidenceTypes: z.array(z.string()).default([]),
  probeFamilies: z.array(z.string()).default([]),
  isRequired: z.boolean().default(true),
});

export type CoverageNode = z.infer<typeof coverageNodeSchema>;

export const coveragePlanSchema = z.object({
  surveyId: z.string(),
  programId: z.enum(EDUCATION_PROGRAM_IDS),
  version: z.number().int().positive(),
  nodes: z.array(coverageNodeSchema),
  completionRule: z.object({
    minimumRequiredNodeCoverage: z.number().min(0).max(1).default(0.8),
    minimumReliability: z.number().min(0).max(1).default(0.65),
  }),
});

export type CoveragePlan = z.infer<typeof coveragePlanSchema>;

export const evidenceRecordSchema = z.object({
  id: z.string(),
  surveyId: z.string(),
  sessionId: z.string(),
  turnId: z.string().optional(),
  nodeId: z.string(),
  evidenceType: z.string(),
  excerpt: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).optional(),
  reliability: z.number().int().min(0).max(100),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export const sessionStateSchema = z.object({
  sessionId: z.string(),
  surveyId: z.string(),
  sessionType: z.enum(["sample", "live"]),
  status: z.enum(["active", "completed", "paused", "flagged"]).default("active"),
  language: z.enum(["en", "fr", "de", "es", "it"]).default("en"),
  currentNodeId: z.string().nullable().default(null),
  completedNodeIds: z.array(z.string()).default([]),
  pendingNodeIds: z.array(z.string()).default([]),
  coverageByNode: z.record(z.string(), z.number()).default({}),
  overallCoverage: z.number().min(0).max(1).default(0),
  fatigueScore: z.number().min(0).max(1).default(0),
  reliabilityScore: z.number().min(0).max(1).default(0.8),
  contradictions: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  respondentProfile: z.object({
    role: z.string().optional(),
    confidence: z.string().optional(),
    preferences: z.array(z.string()).default([]),
  }).default({ preferences: [] }),
  stopReason: z.string().optional(),
  needsHumanReview: z.boolean().default(false),
});

export type SessionState = z.infer<typeof sessionStateSchema>;

export const conversationInsightSchema = z.object({
  sessionId: z.string(),
  surveyId: z.string(),
  summary: z.string(),
  nodeCoverage: z.record(z.string(), z.number()).default({}),
  keyFindings: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  notableQuotes: z.array(evidenceRecordSchema).default([]),
  quality: z.object({
    reliability: z.number().min(0).max(1).default(0),
    completeness: z.number().min(0).max(1).default(0),
    fatigue: z.number().min(0).max(1).default(0),
  }),
});

export type ConversationInsight = z.infer<typeof conversationInsightSchema>;

export const analyticsFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  nodeIds: z.array(z.string()).default([]),
  supportingEvidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export const analyticsGenerationMetadataSchema = z.object({
  triggeredBy: z.enum(["automatic", "manual"]).default("automatic"),
  triggerReason: z.string().default("automatic_refresh"),
  materialityScore: z.number().min(0).default(0),
  completedSessionDelta: z.number().int().nonnegative().default(0),
  overallCoverageDelta: z.number().min(0).default(0),
  reliabilityDelta: z.number().min(0).default(0),
  nodeMilestones: z.array(z.string()).default([]),
});

export type AnalyticsGenerationMetadata = z.infer<
  typeof analyticsGenerationMetadataSchema
>;

export const analyticsSnapshotSchema = z.object({
  surveyId: z.string(),
  version: z.number().int().positive(),
  generatedAt: z.string(),
  programId: z.enum(EDUCATION_PROGRAM_IDS),
  briefVersion: z.number().int().positive(),
  coverage: z.object({
    overall: z.number().min(0).max(1),
    byNode: z.record(z.string(), z.number()).default({}),
  }),
  participation: z.object({
    totalSessions: z.number().int().nonnegative(),
    completedSessions: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(100),
  }),
  quality: z.object({
    averageReliability: z.number().min(0).max(1),
    averageFatigue: z.number().min(0).max(1),
    flaggedSessions: z.number().int().nonnegative(),
  }),
  findings: z.array(analyticsFindingSchema).default([]),
  derivedMetrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.number().int().nonnegative(),
      description: z.string().default(""),
    }),
  ).default([]),
  recommendations: z.array(z.string()).default([]),
  dataGaps: z.array(z.string()).default([]),
  keyQuotes: z.array(evidenceRecordSchema).default([]),
  generation: analyticsGenerationMetadataSchema.optional(),
});

export type AnalyticsSnapshot = z.infer<typeof analyticsSnapshotSchema>;

export const analyticsGenerationStateSchema = z.object({
  surveyId: z.string(),
  status: z.enum(["idle", "queued", "running", "failed"]).default("idle"),
  latestSnapshotVersion: z.number().int().nonnegative().default(0),
  pendingJobId: z.string().nullable().default(null),
  lastRequestedAt: z.string().nullable().default(null),
  lastCompletedAt: z.string().nullable().default(null),
  lastMaterialityReason: z.string().nullable().default(null),
  lastMaterialityScore: z.number().min(0).default(0),
  lastError: z.string().nullable().default(null),
});

export type AnalyticsGenerationState = z.infer<
  typeof analyticsGenerationStateSchema
>;

export const analyticsFactSchema = z.object({
  id: z.string(),
  surveyId: z.string(),
  sessionId: z.string(),
  nodeId: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).default("neutral"),
  confidence: z.number().min(0).max(1).default(0.5),
  themes: z.array(z.string()).default([]),
  outcomeSignal: z.string().default("general_feedback"),
  sourceEvidenceIds: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
});

export type AnalyticsFact = z.infer<typeof analyticsFactSchema>;

export interface EducationProgramManifest {
  id: EducationProgramId;
  displayName: string;
  description: string;
  routing: { keywords: string[]; examples: string[] };
  requiredBriefFields: string[];
  defaultDurationMinutes: number;
  analyticsDimensions: string[];
  policyFlags: {
    allowSensitiveTopics: boolean;
    requiresConsent: boolean;
    piiMaskingRequired: boolean;
  };
  nodes: CoverageNode[];
}

export interface EducationProgramAssets {
  manifest: EducationProgramManifest;
  creationPrompt: string;
  conductingPrompt: string;
  analyticsPrompt: string;
}

export interface BriefValidationResult {
  isReady: boolean;
  missingFields: string[];
  notes: string[];
}
