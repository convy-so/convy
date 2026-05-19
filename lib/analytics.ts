import crypto from "crypto";

import type {
  AnalyticsGenerationMetadata,
  AnalyticsGenerationState,
  AnalyticsSnapshot,
  ConversationInsight,
  CoveragePlan,
  EvidenceRecord,
  ResearchBrief,
} from "@/lib/education/types";
import type { AppLocale } from "@/lib/i18n/config";
import { getCachedTranslation } from "@/lib/i18n/ai-cache";
import { enqueueContentTranslation } from "@/lib/queue";

function isEvidenceRecord(value: EvidenceRecord | undefined): value is EvidenceRecord {
  return Boolean(value);
}

function hashAnalyticsText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function translateFromCacheOrQueue(params: {
  texts: string[];
  targetLanguage: AppLocale;
  resourceType: string;
  resourceId: string;
  sourceLocale?: AppLocale;
  context: string;
}) {
  if (params.targetLanguage === "en") {
    return params.texts;
  }

  const cachedByText = new Map<string, string>();

  await Promise.all(
    Array.from(new Set(params.texts.map((text) => text.trim()).filter(Boolean))).map(
      async (text) => {
        const cached = await getCachedTranslation(text, params.targetLanguage);
        if (cached) {
          cachedByText.set(text, cached);
          return;
        }

        await enqueueContentTranslation({
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          field: hashAnalyticsText(text),
          sourceLocale: params.sourceLocale ?? "en",
          targetLocale: params.targetLanguage,
          sourceText: text,
          context: params.context,
        }).catch(() => undefined);
      },
    ),
  );

  return params.texts.map((text) => cachedByText.get(text.trim()) ?? text);
}

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

export function buildDashboardAnalyticsData(input: {
  surveyTitle: string;
  brief: ResearchBrief;
  briefVersion: number;
  plan: CoveragePlan;
  snapshot: AnalyticsSnapshot;
  analyticsState: AnalyticsGenerationState;
  timeline: AnalyticsTimelineEntry[];
  programDisplayName: string;
  programDescription: string;
  evidence: EvidenceRecord[];
}): SurveyAnalyticsData {
  const evidenceById = new Map(
    input.evidence.map((quote) => [quote.id, quote]),
  );

  return {
    status: "ready",
    surveyId: input.snapshot.surveyId,
    surveyTitle: input.surveyTitle,
    generatedAt: input.snapshot.generatedAt,
    snapshotVersion: input.snapshot.version,
    analyticsState: input.analyticsState,
    program: {
      id: input.snapshot.programId,
      displayName: input.programDisplayName,
      description: input.programDescription,
    },
    brief: {
      version: input.briefVersion,
      researchGoal: input.brief.researchGoal,
      decisionToInform: input.brief.decisionToInform,
      audienceDefinition: input.brief.audienceDefinition,
      requiredTopics: input.brief.requiredTopics,
      successCriteria: input.brief.successCriteria,
      analysisQuestions: input.brief.analysisQuestions,
    },
    participation: {
      totalSessions: input.snapshot.participation.totalSessions,
      completedSessions: input.snapshot.participation.completedSessions,
      completionRate: input.snapshot.participation.completionRate,
    },
    quality: {
      averageReliabilityPercent: Math.round(
        input.snapshot.quality.averageReliability * 100,
      ),
      averageFatiguePercent: Math.round(
        input.snapshot.quality.averageFatigue * 100,
      ),
      flaggedSessions: input.snapshot.quality.flaggedSessions,
    },
    coverage: {
      overallPercent: Math.round(input.snapshot.coverage.overall * 100),
      nodes: input.plan.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        description: node.description,
        priority: node.priority,
        completionThreshold: node.completionThreshold,
        coveragePercent: Math.round(
          (input.snapshot.coverage.byNode[node.id] ?? 0) * 100,
        ),
      })),
    },
    findings: input.snapshot.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      summary: finding.summary,
      confidence: finding.confidence,
      nodeIds: finding.nodeIds,
      nodeLabels: input.plan.nodes
        .filter((node) => finding.nodeIds.includes(node.id))
        .map((node) => node.label),
      supportingEvidence:
        finding.supportingEvidenceIds
          .map((id) => evidenceById.get(id))
          .filter(isEvidenceRecord),
    })),
    derivedMetrics: input.snapshot.derivedMetrics ?? [],
    recommendations: input.snapshot.recommendations,
    dataGaps: input.snapshot.dataGaps,
    keyQuotes: input.snapshot.keyQuotes,
    timeline: input.timeline,
  };
}

export function buildTimelineEntry(snapshot: AnalyticsSnapshot): AnalyticsTimelineEntry {
  const generation: AnalyticsGenerationMetadata | undefined = snapshot.generation;
  return {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    triggerReason: generation?.triggerReason ?? "automatic_refresh",
    triggeredBy: generation?.triggeredBy ?? "automatic",
    completedSessions: snapshot.participation.completedSessions,
    totalSessions: snapshot.participation.totalSessions,
    coveragePercent: Math.round(snapshot.coverage.overall * 100),
    reliabilityPercent: Math.round(snapshot.quality.averageReliability * 100),
    flaggedSessions: snapshot.quality.flaggedSessions,
    findingsCount: snapshot.findings.length,
    dataGapsCount: snapshot.dataGaps.length,
  };
}

export function buildAnalyticsCompareData(input: {
  left: AnalyticsSnapshot;
  right: AnalyticsSnapshot;
  plan: CoveragePlan;
}): AnalyticsCompareData {
  const left = buildTimelineEntry(input.left);
  const right = buildTimelineEntry(input.right);
  const leftFindings = new Set(input.left.findings.map((item) => item.title));
  const rightFindings = new Set(input.right.findings.map((item) => item.title));
  const leftRecommendations = new Set(input.left.recommendations);
  const rightRecommendations = new Set(input.right.recommendations);
  const leftGaps = new Set(input.left.dataGaps);
  const rightGaps = new Set(input.right.dataGaps);

  return {
    left,
    right,
    metricDelta: {
      completedSessions: right.completedSessions - left.completedSessions,
      totalSessions: right.totalSessions - left.totalSessions,
      coveragePercent: right.coveragePercent - left.coveragePercent,
      reliabilityPercent: right.reliabilityPercent - left.reliabilityPercent,
      flaggedSessions: right.flaggedSessions - left.flaggedSessions,
      findingsCount: right.findingsCount - left.findingsCount,
      dataGapsCount: right.dataGapsCount - left.dataGapsCount,
    },
    coverageChanges: input.plan.nodes.map((node) => {
      const fromPercent = Math.round((input.left.coverage.byNode[node.id] ?? 0) * 100);
      const toPercent = Math.round((input.right.coverage.byNode[node.id] ?? 0) * 100);
      return {
        nodeId: node.id,
        label: node.label,
        fromPercent,
        toPercent,
        deltaPercent: toPercent - fromPercent,
      };
    }),
    findingsAdded: [...rightFindings].filter((title) => !leftFindings.has(title)),
    findingsRemoved: [...leftFindings].filter((title) => !rightFindings.has(title)),
    recommendationsAdded: [...rightRecommendations].filter(
      (item) => !leftRecommendations.has(item),
    ),
    recommendationsRemoved: [...leftRecommendations].filter(
      (item) => !rightRecommendations.has(item),
    ),
    dataGapsClosed: [...leftGaps].filter((item) => !rightGaps.has(item)),
    dataGapsOpened: [...rightGaps].filter((item) => !leftGaps.has(item)),
  };
}

export function buildConversationListItem(input: {
  insight: ConversationInsight;
  sessionType: string;
  createdAt: Date;
  sourceConversationId: string | null;
}): AnalyticsConversationListItem {
  return {
    sessionId: input.insight.sessionId,
    sourceConversationId: input.sourceConversationId,
    sessionType: input.sessionType,
    createdAt: input.createdAt.toISOString(),
    summary: input.insight.summary,
    keyFindings: input.insight.keyFindings,
    risks: input.insight.risks,
    completenessPercent: Math.round(input.insight.quality.completeness * 100),
    reliabilityPercent: Math.round(input.insight.quality.reliability * 100),
    fatiguePercent: Math.round(input.insight.quality.fatigue * 100),
    notableQuotes: input.insight.notableQuotes,
  };
}

export async function translateSurveyAnalyticsData(
  data: SurveyAnalyticsData,
  targetLanguage: AppLocale,
  _metadata?: {
    userId?: string;
    surveyId?: string;
  },
): Promise<SurveyAnalyticsData> {
  const texts: string[] = [
    data.brief.researchGoal,
    data.brief.decisionToInform,
    data.brief.audienceDefinition,
    ...data.brief.requiredTopics,
    ...data.brief.successCriteria,
    ...data.brief.analysisQuestions,
    ...data.coverage.nodes.flatMap((node) => [node.label, node.description]),
    ...data.findings.flatMap((finding) => [finding.title, finding.summary]),
    ...data.findings.flatMap((finding) =>
      finding.supportingEvidence.map((evidence) => evidence.excerpt),
    ),
    ...data.derivedMetrics.flatMap((metric) => [metric.label, metric.description]),
    ...data.recommendations,
    ...data.dataGaps,
    ...data.keyQuotes.map((quote) => quote.excerpt),
  ];

  const translated = await translateFromCacheOrQueue({
    texts,
    targetLanguage,
    resourceType: "survey_analytics_dashboard",
    resourceId: data.surveyId,
    context: "Survey analytics dashboard content",
  });

  let index = 0;
  const next = () => translated[index++] ?? "";

  return {
    ...data,
    brief: {
      ...data.brief,
      researchGoal: next(),
      decisionToInform: next(),
      audienceDefinition: next(),
      requiredTopics: data.brief.requiredTopics.map(() => next()),
      successCriteria: data.brief.successCriteria.map(() => next()),
      analysisQuestions: data.brief.analysisQuestions.map(() => next()),
    },
    coverage: {
      ...data.coverage,
      nodes: data.coverage.nodes.map((node) => ({
        ...node,
        label: next(),
        description: next(),
      })),
    },
    findings: data.findings.map((finding) => ({
      ...finding,
      title: next(),
      summary: next(),
      supportingEvidence: finding.supportingEvidence.map((evidence) => ({
        ...evidence,
        excerpt: next(),
      })),
    })),
    derivedMetrics: data.derivedMetrics.map((metric) => ({
      ...metric,
      label: next(),
      description: next(),
    })),
    recommendations: data.recommendations.map(() => next()),
    dataGaps: data.dataGaps.map(() => next()),
    keyQuotes: data.keyQuotes.map((quote) => ({
      ...quote,
      excerpt: next(),
    })),
  };
}

export async function translateConversationListItems(
  conversations: AnalyticsConversationListItem[],
  targetLanguage: AppLocale,
  metadata?: {
    userId?: string;
    surveyId?: string;
  },
): Promise<AnalyticsConversationListItem[]> {
  if (conversations.length === 0) {
    return conversations;
  }

  const texts = conversations.flatMap((conversation) => [
    conversation.summary,
    ...conversation.keyFindings,
    ...conversation.risks,
    ...conversation.notableQuotes.map((quote) => quote.excerpt),
  ]);
  const translated = await translateFromCacheOrQueue({
    texts,
    targetLanguage,
    resourceType: "survey_analytics_conversations",
    resourceId: metadata?.surveyId ?? "unknown-survey",
    context: "Survey analytics conversation summaries",
  });
  let index = 0;
  const next = () => translated[index++] ?? "";

  return conversations.map((conversation) => ({
    ...conversation,
    summary: next(),
    keyFindings: conversation.keyFindings.map(() => next()),
    risks: conversation.risks.map(() => next()),
    notableQuotes: conversation.notableQuotes.map((quote) => ({
      ...quote,
      excerpt: next(),
    })),
  }));
}
