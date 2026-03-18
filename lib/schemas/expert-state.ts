import { z } from "zod";

export const expertStateBriefSchema = z.object({
  objectives: z.array(z.string()).default([]),
  decisionMap: z.record(z.string(), z.string()).default({}),
  successMetrics: z.object({
    minDataReliabilityScore: z.number().min(0).max(1).default(0.7),
    targetRespondentCount: z.number().int().min(1).default(50),
  }).default({ minDataReliabilityScore: 0.7, targetRespondentCount: 50 }),
  sensitiveTopics: z.array(z.string()).default([]),
  durationEstimateMinutes: z.number().int().positive().default(10),
  escalationTriggers: z.array(z.string()).default([]),
  productContext: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    domainFamily: z.string().optional()
  }).optional()
});

export const expertStateAudienceModelSchema = z.object({
  psychographicProfile: z.string().optional(),
  expectedVocabulary: z.string().optional(),
  knownBiases: z.array(z.string()).default([]),
  segments: z.array(z.object({
    name: z.string(),
    description: z.string()
  })).default([])
});

export interface CoverageNode {
  id: string;
  label: string;
  parentId: string | null;
  status: "pending" | "partial" | "met";
  confidenceScore: number;
  touchCount: number;
  qualityScore: number;
  priority: number;
  evidence?: string;
  verbatimQuotes: string[];
  lastTurnAddressed?: number;
  children: CoverageNode[];
}

export const coverageNodeSchema: z.ZodType<CoverageNode> = z.object({
  id: z.string(),
  label: z.string(),
  parentId: z.string().nullable().default(null),
  status: z.enum(["pending", "partial", "met"]).default("pending"),
  confidenceScore: z.number().min(0).max(1).default(0),
  touchCount: z.number().int().min(0).default(0),
  qualityScore: z.number().min(0).max(1).default(0),
  priority: z.number().min(0).max(1).default(0.5),
  evidence: z.string().optional(),
  verbatimQuotes: z.array(z.string()).default([]),
  lastTurnAddressed: z.number().int().optional(),
  children: z.lazy(() => z.array(coverageNodeSchema)).default([])
}) as any;

export const expertStateCoverageTrackerSchema = z.object({
  nodes: z.array(coverageNodeSchema).default([]),
  overallCoverage: z.number().min(0).max(1).default(0),
  bookmarkedNodes: z.array(z.string()).default([]),
  currentTopicId: z.string().nullable().default(null)
});

export const expertStateRespondentProfileSchema = z.object({
  detectedVocabulary: z.string().optional(),
  engagementTrajectory: z.array(z.object({
    turnNumber: z.number().int(),
    score: z.number().min(0).max(1)
  })).default([]),
  forthcomingTopics: z.array(z.string()).default([]),
  evadedTopics: z.array(z.string()).default([]),
  emotionalSignals: z.array(z.object({
    turnNumber: z.number().int(),
    emotionType: z.string(),
    topic: z.string().optional()
  })).default([])
});

export const turnQualityRecordSchema = z.object({
  turnNumber: z.number().int(),
  engagementScore: z.number().min(0).max(1),
  socialDesirabilityFlag: z.boolean().default(false),
  evasionFlag: z.boolean().default(false),
  inconsistencyFlag: z.boolean().default(false),
  contradictedStatement: z.string().optional(),
  reliabilityScore: z.number().min(0).max(1)
});

export const expertStateQualitySignalsSchema = z.object({
  turnRecords: z.array(turnQualityRecordSchema).default([]),
  sessionAggregates: z.object({
    overallReliability: z.number().min(0).max(1).default(1),
    socialDesirabilityIndex: z.number().min(0).max(1).default(0),
    evasionIndex: z.number().min(0).max(1).default(0)
  }).default({
    overallReliability: 1,
    socialDesirabilityIndex: 0,
    evasionIndex: 0
  })
});

export const transcriptTurnSchema = z.object({
  speaker: z.enum(["agent", "respondent"]),
  text: z.string(),
  timestamp: z.string().datetime(),
  // Agent specific
  probeTypeUsed: z.string().optional(),
  targetNode: z.string().optional(),
  // Respondent specific
  nodesAddressed: z.array(z.string()).optional(),
  detectedSentiment: z.string().optional(),
  lowReliabilityFlag: z.boolean().optional()
});

export const expertStateTranscriptSchema = z.object({
  turns: z.array(transcriptTurnSchema).default([])
});

export const expertStateSessionMetaSchema = z.object({
  status: z.enum([
    "brief_pending",
    "brief_complete",
    "warmup",
    "core_survey",
    "deep_probe",
    "closure",
    "coverage_complete",
    "analytics_running",
    "report_ready",
    "flagged_low_quality"
  ]).default("brief_pending"),
  modality: z.enum(["voice", "text"]),
  personaId: z.string().optional(),
  skillFileVersion: z.string().optional()
});

export const expertStatePendingAdaptationsSchema = z.object({
  adaptations: z.array(z.object({
    type: z.string(),
    reason: z.string(),
    applied: z.boolean().default(false)
  })).default([])
});

export const expertStateDataGovernanceSchema = z.object({
  consentGranted: z.boolean().default(false),
  consentTimestamp: z.string().datetime().optional(),
  piiMaskingRequired: z.boolean().default(true),
  dataRetentionExpiry: z.string().datetime().optional()
});

export const expertStateRecoveryStateSchema = z.object({
  lastStableTurnId: z.number().int().optional(),
  consecutiveErrorCount: z.number().int().min(0).default(0)
});

export const expertStateTelemetrySchema = z.object({
  totalTokensUsed: z.number().int().min(0).default(0),
  computeDurationMs: z.number().int().min(0).default(0)
});

export const expertStateSchema = z.object({
  brief: expertStateBriefSchema.default({}),
  audienceModel: expertStateAudienceModelSchema.default({}),
  coverageTracker: expertStateCoverageTrackerSchema.default({}),
  respondentProfile: expertStateRespondentProfileSchema.default({}),
  qualitySignals: expertStateQualitySignalsSchema.default({}),
  transcript: expertStateTranscriptSchema.default({}),
  sessionMeta: expertStateSessionMetaSchema,
  pendingAdaptations: expertStatePendingAdaptationsSchema.default({}),
  dataGovernance: expertStateDataGovernanceSchema.default({}),
  recoveryState: expertStateRecoveryStateSchema.default({}),
  telemetry: expertStateTelemetrySchema.default({})
});

export type ExpertState = z.infer<typeof expertStateSchema>;
