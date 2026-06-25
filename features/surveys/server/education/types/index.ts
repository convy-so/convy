import { z } from "zod";

import { surveyMediaSchema } from "../brief-media";
import {
  CREATION_CONTROLLER_ACTION_VALUES,
  CREATION_FIELD_QUALITY_STATUS_VALUES,
  SURVEY_ANALYTICS_STATE_VALUES,
  SURVEY_ANALYTICS_TRIGGER_VALUES,
  SURVEY_DEFAULTS,
  SURVEY_LANGUAGE_VALUES,
  SURVEY_SENTIMENT_VALUES,
  SURVEY_SESSION_STATUS_VALUES,
  SURVEY_SESSION_TYPE_VALUES,
  SURVEY_TONE_VALUES,
} from "@/shared/surveys/constants";

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

export const creationFieldQualitySchema = z.object({
  field: z.string(),
  status: z.enum(CREATION_FIELD_QUALITY_STATUS_VALUES),
  valueSummary: z.string().default(""),
  evidence: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  specificity: z.number().min(0).max(1).default(0),
  unresolvedIssue: z.string().default(""),
  lastAskedQuestion: z.string().default(""),
});

export type CreationFieldQuality = z.infer<typeof creationFieldQualitySchema>;

export const creationControllerStateSchema = z.object({
  version: z.literal(1).default(1),
  action: z
    .enum(CREATION_CONTROLLER_ACTION_VALUES)
    .default(CREATION_CONTROLLER_ACTION_VALUES[0]),
  targetField: z.string().nullable().default(null),
  fieldQuality: z.array(creationFieldQualitySchema).default([]),
  askedFieldHistory: z
    .array(
      z.object({
        field: z.string(),
        question: z.string(),
      }),
    )
    .default([]),
  readinessRationale: z.string().default(""),
});

export type CreationControllerState = z.infer<
  typeof creationControllerStateSchema
>;

const researchBriefBaseSchema = z.object({
  programId: z.enum(EDUCATION_PROGRAM_IDS),
  title: z.string().min(1),
  researchGoal: z.string().min(1),
  decisionToInform: z.string().min(1),
  audienceDefinition: z.string().min(1),
  audienceRelationship: z.string().optional(),
  audienceKnowledgeLevel: z.string().optional(),
  learningContext: z.string().min(1),
  studyContext: z.string().min(1).optional(),
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
  tone: z.enum(SURVEY_TONE_VALUES).default(SURVEY_DEFAULTS.tone),
  media: z.array(surveyMediaSchema).default([]),
  routingConfidence: z.number().min(0).max(1).default(0),
  routingRationale: z.string().default(""),
  missingFields: z.array(z.string()).default([]),
  readyForSampling: z.boolean().default(false),
  creationController: creationControllerStateSchema,
});

export const researchBriefSchema = researchBriefBaseSchema;
export type ResearchBrief = z.infer<typeof researchBriefSchema>;

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
  sentiment: z.enum(SURVEY_SENTIMENT_VALUES).optional(),
  reliability: z.number().int().min(0).max(100),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export const sessionStateSchema = z.object({
  sessionId: z.string(),
  surveyId: z.string(),
  sessionType: z.enum(SURVEY_SESSION_TYPE_VALUES),
  status: z
    .enum(SURVEY_SESSION_STATUS_VALUES)
    .default(SURVEY_SESSION_STATUS_VALUES[0]),
  language: z.enum(SURVEY_LANGUAGE_VALUES).default(SURVEY_DEFAULTS.language),
  currentNodeId: z.string().nullable().default(null),
  completedNodeIds: z.array(z.string()).default([]),
  pendingNodeIds: z.array(z.string()).default([]),
  coverageByNode: z.record(z.string(), z.number()).default({}),
  overallCoverage: z.number().min(0).max(1).default(0),
  fatigueScore: z.number().min(0).max(1).default(0),
  reliabilityScore: z.number().min(0).max(1).default(0.8),
  contradictions: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  respondentProfile: z
    .object({
      role: z.string().optional(),
      confidence: z.string().optional(),
      preferences: z.array(z.string()).default([]),
    })
    .default({ preferences: [] }),
  conversationSummary: z.string().default(""),
  summaryVersion: z.number().int().nonnegative().default(0),
  activeWorkflowDecision: z
    .object({
      activeNodeId: z.string().nullable().default(null),
      rationale: z.string().default(""),
      shouldStop: z.boolean().default(false),
    })
    .default({
      activeNodeId: null,
      rationale: "",
      shouldStop: false,
    }),
  contextBudgetSnapshot: z
    .object({
      summaryTokens: z.number().int().nonnegative().default(0),
      evidenceCount: z.number().int().nonnegative().default(0),
      pendingNodeCount: z.number().int().nonnegative().default(0),
    })
    .default({
      summaryTokens: 0,
      evidenceCount: 0,
      pendingNodeCount: 0,
    }),
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
  triggeredBy: z
    .enum(SURVEY_ANALYTICS_TRIGGER_VALUES)
    .default(SURVEY_ANALYTICS_TRIGGER_VALUES[0]),
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
  derivedMetrics: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        value: z.number().int().nonnegative(),
        description: z.string().default(""),
      }),
    )
    .default([]),
  recommendations: z.array(z.string()).default([]),
  dataGaps: z.array(z.string()).default([]),
  keyQuotes: z.array(evidenceRecordSchema).default([]),
  generation: analyticsGenerationMetadataSchema.optional(),
});

export type AnalyticsSnapshot = z.infer<typeof analyticsSnapshotSchema>;

export const analyticsGenerationStateSchema = z.object({
  surveyId: z.string(),
  status: z
    .enum(SURVEY_ANALYTICS_STATE_VALUES)
    .default(SURVEY_ANALYTICS_STATE_VALUES[0]),
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
  sentiment: z
    .enum(SURVEY_SENTIMENT_VALUES)
    .default(SURVEY_SENTIMENT_VALUES[2]),
  confidence: z.number().min(0).max(1).default(0.5),
  themes: z.array(z.string()).default([]),
  outcomeSignal: z.string().default("general_feedback"),
  sourceEvidenceIds: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
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
  fieldQuality: CreationFieldQuality[];
  targetField: string | null;
  nextAction: CreationControllerState["action"];
}
