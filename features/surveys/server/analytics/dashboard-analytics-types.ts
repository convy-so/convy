import type {
  AnalyticsGenerationState,
  EvidenceRecord,
} from "@/features/surveys/server/education/types";

export interface AnalyticsDashboardNodeView {
  id: string;
  label: string;
  description: string;
  priority: number;
  completionThreshold: number;
  coveragePercent: number;
}

export interface AnalyticsDashboardFindingView {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  nodeIds: string[];
  nodeLabels: string[];
  supportingEvidence: EvidenceRecord[];
}

export interface SurveyAnalyticsData {
  status: "ready";
  surveyId: string;
  surveyTitle: string;
  generatedAt: string;
  snapshotVersion: number;
  analyticsState: AnalyticsGenerationState;
  program: {
    id: string;
    displayName: string;
    description: string;
  };
  brief: {
    version: number;
    researchGoal: string;
    decisionToInform: string;
    audienceDefinition: string;
    requiredTopics: string[];
    successCriteria: string[];
    analysisQuestions: string[];
  };
  participation: {
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
  };
  quality: {
    averageReliabilityPercent: number;
    averageFatiguePercent: number;
    flaggedSessions: number;
  };
  coverage: {
    overallPercent: number;
    nodes: AnalyticsDashboardNodeView[];
  };
  findings: AnalyticsDashboardFindingView[];
  derivedMetrics: Array<{
    id: string;
    label: string;
    value: number;
    description: string;
  }>;
  recommendations: string[];
  dataGaps: string[];
  keyQuotes: EvidenceRecord[];
  timeline: AnalyticsTimelineEntry[];
}

export interface AnalyticsPendingData {
  status: "not_generated" | "queued" | "running" | "failed";
  message: string;
  analyticsState: AnalyticsGenerationState;
  conversationStats: {
    total: number;
    completed: number;
  };
}

export interface AnalyticsTimelineEntry {
  version: number;
  generatedAt: string;
  triggerReason: string;
  triggeredBy: "automatic" | "manual";
  completedSessions: number;
  totalSessions: number;
  coveragePercent: number;
  reliabilityPercent: number;
  flaggedSessions: number;
  findingsCount: number;
  dataGapsCount: number;
}

export interface AnalyticsCompareData {
  left: AnalyticsTimelineEntry;
  right: AnalyticsTimelineEntry;
  metricDelta: {
    completedSessions: number;
    totalSessions: number;
    coveragePercent: number;
    reliabilityPercent: number;
    flaggedSessions: number;
    findingsCount: number;
    dataGapsCount: number;
  };
  coverageChanges: Array<{
    nodeId: string;
    label: string;
    fromPercent: number;
    toPercent: number;
    deltaPercent: number;
  }>;
  findingsAdded: string[];
  findingsRemoved: string[];
  recommendationsAdded: string[];
  recommendationsRemoved: string[];
  dataGapsClosed: string[];
  dataGapsOpened: string[];
}

export interface AnalyticsConversationListItem {
  sessionId: string;
  sourceConversationId: string | null;
  sessionType: string;
  createdAt: string;
  summary: string;
  keyFindings: string[];
  risks: string[];
  completenessPercent: number;
  reliabilityPercent: number;
  fatiguePercent: number;
  notableQuotes: EvidenceRecord[];
}

export interface AnalyticsConversationsResponse {
  conversations: AnalyticsConversationListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  aggregateStats: {
    totalConversations: number;
    completedHighQuality: number;
    flaggedConversations: number;
    averageReliabilityPercent: number;
    averageCompletenessPercent: number;
  };
}

export interface AnalyticsSessionDetail {
  id: string;
  surveyId: string;
  surveyTitle: string;
  sessionType: string;
  sourceConversationId: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  summary: string;
  keyFindings: string[];
  risks: string[];
  reliabilityPercent: number;
  completenessPercent: number;
  fatiguePercent: number;
  nodeCoverage: Array<{
    id: string;
    label: string;
    description: string;
    coveragePercent: number;
  }>;
  notableQuotes: EvidenceRecord[];
  evidence: EvidenceRecord[];
  transcript: Array<{
    id: string;
    role: string;
    content: string;
  }>;
}
