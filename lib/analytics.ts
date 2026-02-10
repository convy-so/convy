
/**
 * Analytics Module
 *
 * Provides structured types, schemas, and utilities for survey analytics.
 * Designed for production use with:
 * - Strongly typed interfaces
 * - Zod validation schemas
 * - Dashboard-ready data structures
 * - Quantitative + qualitative insights
 */

import { z } from "zod";

// ============================================================================
// CORE ANALYTICS TYPES
// ============================================================================

/**
 * Sentiment analysis result
 */
export interface SentimentAnalysis {
  overall: "positive" | "negative" | "neutral" | "mixed";
  score: number; // -1 to 1 scale
  confidence: number; // 0 to 1
}

/**
 * A single extracted quote from a conversation
 */
export interface ExtractedQuote {
  text: string;
  conversationId: string;
  context?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

// ============================================================================
// TIER 1: CORE METRICS (Always calculated)
// ============================================================================

export interface CoreMetrics {
  // Participation metrics
  totalConversations: number;
  completedConversations: number;
  completionRate: number; // 0-100 percentage

  // Engagement metrics
  averageMessagesPerConversation: number;
  averageResponseLength: number; // Average words per user response
  averageFollowUpDepth: number; // Average chain of follow-up questions achieved
  medianDurationMinutes: number;
  medianActiveDurationMinutes: number;

  // Quality metrics
  insightQualityScore: number; // 1-10 scale
  responseEngagementDistribution: {
    high: number; // count
    medium: number;
    low: number;
  };

  // Coverage metrics
  requiredQuestionsCompletion: RequiredQuestionCoverage[];
}

export interface RequiredQuestionCoverage {
  question: string;
  coverageRate: number; // 0-100 percentage
  qualityScore: number; // 1-10
  sampleResponses: string[]; // Up to 3 representative responses
}

// ============================================================================
// TIER 2: CREATOR-DEFINED METRICS
// ============================================================================

export type MetricType =
  | "categorical"
  | "numeric"
  | "sentiment"
  | "boolean"
  | "text";

export interface CreatorMetricValue {
  value: string | number | boolean;
  count: number;
  percentage: number;
  examples: ExtractedQuote[];
}

export interface CreatorMetric {
  name: string;
  type: MetricType;
  description?: string;
  values: CreatorMetricValue[];
  summary: string;

  // For dashboard visualizations
  chartType: "pie" | "bar" | "histogram" | "wordcloud" | "text" | "metric_breakdown";
  chartData: ChartDataPoint[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TIER 3: HYPOTHESIS VALIDATION
// ============================================================================

export type HypothesisStatus =
  | "validated"
  | "refuted"
  | "mixed"
  | "insufficient_data";

export interface HypothesisEvidence {
  quote: string;
  conversationId: string;
  type: "supporting" | "contradicting";
}

export interface HypothesisValidation {
  hypothesis: string;
  status: HypothesisStatus;
  confidence: number; // 0-100 percentage
  supportingCount: number;
  contradictingCount: number;
  supportingEvidence: HypothesisEvidence[];
  contradictingEvidence: HypothesisEvidence[];
  summary: string;
  recommendation: string;
}

// ============================================================================
// TIER 4: AI-DISCOVERED INSIGHTS
// ============================================================================

export type InsightSignificance = "high" | "medium" | "low";
export type InsightType =
  | "trend"
  | "pattern"
  | "outlier"
  | "correlation"
  | "gap";

export interface DiscoveredTrend {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  frequency: number; // How many conversations showed this
  frequencyPercentage: number;
  significance: InsightSignificance;
  sentiment?: "positive" | "negative" | "neutral";
  supportingQuotes: ExtractedQuote[];
  relatedTopics: string[];
}

export interface DiscoveredOutlier {
  id: string;
  conversationId: string;
  description: string;
  whyNotable: string;
  quote: string;
  significance: InsightSignificance;
}

export interface Recommendation {
  id: string;
  type:
    | "action"
    | "follow_up_survey"
    | "product_change"
    | "process_improvement";
  title: string;
  description: string;
  priority: InsightSignificance;
  basedOn: string; // What data supports this
  expectedImpact?: string;
}

export interface EmergentTopic {
  topic: string;
  mentionCount: number;
  mentionPercentage: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  isUnexpected: boolean;
  relatedQuotes: ExtractedQuote[];
  suggestion: string;
}

export interface DiscoveredInsights {
  trends: DiscoveredTrend[];
  outliers: DiscoveredOutlier[];
  recommendations: Recommendation[];
  emergentTopics: EmergentTopic[];

  // Meta-insights
  surprisingFindings: string[];
  dataGaps: string[]; // What couldn't be determined from the data
}

// ============================================================================
// TIER 5: MEDIA ANALYTICS
// ============================================================================

export type MediaReaction =
  | "positive"
  | "negative"
  | "neutral"
  | "confused"
  | "not_shown";

/**
 * Per-conversation media interaction tracking
 */
export interface MediaInteraction {
  mediaId: string;
  mediaType: "image" | "audio" | "video";
  description: string;

  // Usage tracking
  wasReferenced: boolean; // Did AI reference this media?
  participantEngaged: boolean; // Did participant respond to it?

  // Quality assessment
  participantReaction: MediaReaction;
  clarityScore: number; // 1-10, did it help understanding?
  insightQuality: "high" | "medium" | "low" | "none";

  // Content extracted
  responsesAboutMedia: string[]; // Quotes specifically discussing this media
  insightsGenerated: string[]; // Insights derived from media discussion

  // Issues
  issuesIdentified: string[]; // Confusion, technical problems, etc.
}

/**
 * Survey-level media effectiveness metrics
 */
export interface MediaEffectivenessMetrics {
  mediaId: string;
  mediaType: "image" | "audio" | "video";
  description: string;

  // Usage statistics
  conversationsWhereAvailable: number;
  conversationsWhereReferenced: number;
  usageRate: number; // 0-100 percentage

  // Engagement metrics
  participantEngagementRate: number; // % of conversations where participant responded to it
  averageClarityScore: number; // 1-10

  // Reaction breakdown
  reactionBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    confused: number;
  };

  // Value metrics
  insightsGeneratedCount: number;
  highValueInsightsCount: number;

  // Representative quotes about this media
  topQuotes: ExtractedQuote[];

  // Issues summary
  commonIssues: string[];
  issueFrequency: number; // % of uses with issues

  // Effectiveness score (computed)
  effectivenessScore: number; // 1-10
  effectivenessLevel: "excellent" | "good" | "moderate" | "poor" | "unused";

  // AI recommendation
  recommendation: string;
}

/**
 * Overall media analytics for the survey
 */
export interface MediaAnalytics {
  // Summary stats
  totalMediaAssets: number;
  mediaByType: {
    images: number;
    audio: number;
    video: number;
  };

  // Usage overview
  overallUsageRate: number; // % of media that was actually used
  mediaWithHighEngagement: number;
  mediaWithIssues: number;

  // Per-media breakdown
  mediaEffectiveness: MediaEffectivenessMetrics[];

  // Insights about media usage
  mediaInsights: {
    mostEffectiveMedia: string | null; // mediaId
    leastEffectiveMedia: string | null;
    topMediaInsight: string; // What the best media revealed
    mediaImpactSummary: string; // Overall impact of media on survey
  };

  // Recommendations
  mediaRecommendations: {
    type: "remove" | "improve" | "add" | "keep";
    mediaId?: string;
    description: string;
    reason: string;
    priority: "high" | "medium" | "low";
  }[];
}

// ============================================================================
// TIER 6: GOAL ACHIEVEMENT ASSESSMENT
// ============================================================================

export interface InsightTypeMetrics {
  collected: boolean;
  count: number;
  quality: "high" | "medium" | "low";
  examples: string[];
}

export interface GoalAssessment {
  surveyObjective: string;
  achievementScore: number; // 1-10
  achievementLevel: "exceeded" | "met" | "partially_met" | "not_met";

  // Insight types collected (matching survey success criteria)
  insightTypesCollected: {
    emotional: InsightTypeMetrics;
    behavioral: InsightTypeMetrics;
    rational: InsightTypeMetrics;
  };

  // What worked vs what didn't
  successfulAspects: string[];
  gapsIdentified: string[];

  // Forward-looking
  recommendedNextSteps: string[];
  suggestedFollowUpQuestions: string[];
}

// ============================================================================
// CONVERSATION-LEVEL INSIGHTS (Per conversation)
// ============================================================================

export interface ConversationInsightData {
  conversationId: string;
  summary: string;
  keyFindings: string[];
  messageCount: number;
  participantResponseCount: number;
  averageResponseLength: number;
  durationMinutes: number;
  activeDurationMinutes: number;
  followUpDepth: number;
  engagementLevel: "high" | "medium" | "low";
  responseQuality: number;
  topicsCovered: string[];
  requiredQuestionsCovered: string[];
  requiredQuestionsMissed: string[];
  sentiment: SentimentAnalysis;
  extractedMetrics: Record<string, string | number | boolean>;
  notableQuotes: ExtractedQuote[];
  hypothesisEvidence: {
    hypothesis: string;
    evidence: "supporting" | "contradicting" | "neutral";
    quote?: string;
  }[];
  mediaInteractions: MediaInteraction[];
}

// ============================================================================
// COMPLETE SURVEY ANALYTICS (Aggregated)
// ============================================================================

export interface SurveyAnalyticsData {
  // Metadata
  surveyId: string;
  surveyTitle: string;
  generatedAt: string;
  dataVersion: string;

  // Executive Summary (for quick dashboard view)
  executiveSummary: {
    headline: string;
    keyInsights: string[];
    overallSentiment: SentimentAnalysis;
    recommendedActions: string[];
  };

  // Detailed Analytics
  coreMetrics: CoreMetrics;
  creatorMetrics: CreatorMetric[];
  hypothesisValidations: HypothesisValidation[];
  discoveredInsights: DiscoveredInsights;
  goalAssessment: GoalAssessment;

  // Media Analytics (if survey has media)
  mediaAnalytics?: MediaAnalytics;

  // For dashboard widgets
  dashboardWidgets: DashboardWidget[];

  // Raw data references
  conversationCount: number;
  lastUpdated: string;
}

// ============================================================================
// DASHBOARD WIDGETS
// ============================================================================

export type WidgetType =
  | "stat_card"
  | "pie_chart"
  | "bar_chart"
  | "histogram"
  | "line_chart"
  | "text"
  | "wordcloud"
  | "word_cloud"
  | "quote_carousel"
  | "progress_bar"
  | "insight_list"
  | "hypothesis_card"
  | "recommendation_card"
  | "metric_breakdown"
  | "sentiment_gauge"
  | "coverage_matrix"
  | "media_effectiveness"
  | "media_card";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  priority: number;
  size: "small" | "medium" | "large" | "full";
  data: unknown; 
}

// Specific widget data types
export interface StatCardData {
  value: number | string;
  label: string;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  icon?: string;
}

export interface PieChartData {
  segments: { label: string; value: number; color?: string }[];
  total?: number;
}

export interface BarChartData {
  bars: { label: string; value: number; color?: string }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface QuoteCarouselData {
  quotes: ExtractedQuote[];
  category?: string;
}

export interface InsightListData {
  insights: { text: string; significance: InsightSignificance }[];
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

export const sentimentAnalysisSchema = z.object({
  overall: z.enum(["positive", "negative", "neutral", "mixed"]),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
});

export const extractedQuoteSchema = z.object({
  text: z.string(),
  conversationId: z.string(),
  context: z.string().optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
});

export const hypothesisEvidenceSchema = z.object({
  quote: z.string(),
  conversationId: z.string(),
  type: z.enum(["supporting", "contradicting"]),
});

export const hypothesisValidationSchema = z.object({
  hypothesis: z.string(),
  status: z.enum(["validated", "refuted", "mixed", "insufficient_data"]),
  confidence: z.number().min(0).max(100),
  supportingCount: z.number(),
  contradictingCount: z.number(),
  supportingEvidence: z.array(hypothesisEvidenceSchema),
  contradictingEvidence: z.array(hypothesisEvidenceSchema),
  summary: z.string(),
  recommendation: z.string(),
});

export const creatorMetricSchema = z.object({
  name: z.string(),
  type: z.enum(["categorical", "numeric", "sentiment", "boolean", "text"]),
  description: z.string().optional(),
  values: z.array(
    z.object({
      value: z.union([z.string(), z.number(), z.boolean()]),
      count: z.number(),
      percentage: z.number(),
      examples: z.array(extractedQuoteSchema),
    })
  ),
  summary: z.string(),
  chartType: z.enum(["pie", "bar", "histogram", "wordcloud", "text", "metric_breakdown"]),
  chartData: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
});

export const discoveredTrendSchema = z.object({
  id: z.string(),
  type: z.enum(["trend", "pattern", "outlier", "correlation", "gap"]),
  title: z.string(),
  description: z.string(),
  frequency: z.number(),
  frequencyPercentage: z.number(),
  significance: z.enum(["high", "medium", "low"]),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  supportingQuotes: z.array(extractedQuoteSchema),
  relatedTopics: z.array(z.string()),
});

export const recommendationSchema = z.object({
  id: z.string(),
  type: z.enum([
    "action",
    "follow_up_survey",
    "product_change",
    "process_improvement",
  ]),
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  basedOn: z.string(),
  expectedImpact: z.string().optional(),
});

export const conversationInsightDataSchema = z.object({
  conversationId: z.string(),
  summary: z.string(),
  keyFindings: z.array(z.string()),
  messageCount: z.number(),
  participantResponseCount: z.number(),
  averageResponseLength: z.number(),
  durationMinutes: z.number(),
  activeDurationMinutes: z.number(),
  followUpDepth: z.number(),
  engagementLevel: z.enum(["high", "medium", "low"]),
  responseQuality: z.number().min(1).max(10),
  topicsCovered: z.array(z.string()),
  requiredQuestionsCovered: z.array(z.string()),
  requiredQuestionsMissed: z.array(z.string()),
  sentiment: sentimentAnalysisSchema,
  extractedMetrics: z.record(z.union([z.string(), z.number(), z.boolean()])),
  notableQuotes: z.array(extractedQuoteSchema),
  hypothesisEvidence: z.array(
    z.object({
      hypothesis: z.string(),
      evidence: z.enum(["supporting", "contradicting", "neutral"]),
      quote: z.string().optional(),
    })
  ),
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate quantitative metrics from conversation data
 */
export function calculateConversationMetrics(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>
): {
  messageCount: number;
  participantResponseCount: number;
  averageResponseLength: number;
  followUpDepth: number;
  durationMinutes: number;
  activeDurationMinutes: number;
} {
  const participantMessages = messages.filter((m) => m.role === "user");
  const totalWords = participantMessages.reduce(
    (sum, m) => sum + m.content.split(/\s+/).length,
    0
  );

  // Calculate follow-up depth (consecutive assistant questions after user responses)
  let maxFollowUpDepth = 0;
  let currentDepth = 0;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
      // Check if this is a follow-up (contains a question)
      if (messages[i].content.includes("?")) {
        currentDepth++;
        maxFollowUpDepth = Math.max(maxFollowUpDepth, currentDepth);
      }
    } else if (messages[i].role === "user") {
      currentDepth = 0;
    }
  }

  // Calculate duration
  let durationMinutes = 0;
  if (
    messages.length >= 2 &&
    messages[0].timestamp &&
    messages[messages.length - 1].timestamp
  ) {
    const start = new Date(messages[0].timestamp!).getTime();
    const end = new Date(messages[messages.length - 1].timestamp!).getTime();
    durationMinutes = (end - start) / (1000 * 60);
  }

  return {
    messageCount: messages.length,
    participantResponseCount: participantMessages.length,
    averageResponseLength:
      participantMessages.length > 0
        ? Math.round(totalWords / participantMessages.length)
        : 0,
    followUpDepth: maxFollowUpDepth,
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    activeDurationMinutes: Math.round(durationMinutes * 10) / 10, // Fallback to total duration
  };
}

/**
 * Determine engagement level from response patterns
 */
export function determineEngagementLevel(
  averageResponseLength: number,
  followUpDepth: number,
  participantResponseCount: number
): "high" | "medium" | "low" {
  const lengthScore =
    averageResponseLength > 50 ? 3 : averageResponseLength > 20 ? 2 : 1;
  const depthScore = followUpDepth > 3 ? 3 : followUpDepth > 1 ? 2 : 1;
  const countScore =
    participantResponseCount > 10 ? 3 : participantResponseCount > 5 ? 2 : 1;

  const totalScore = lengthScore + depthScore + countScore;

  if (totalScore >= 7) return "high";
  if (totalScore >= 4) return "medium";
  return "low";
}

/**
 * Generate a unique ID for insights
 */
export function generateInsightId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create dashboard widgets from analytics data
 */
export function createDashboardWidgets(
  analytics: SurveyAnalyticsData
): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  let priority = 0;

  // 1. Key Stats Cards
  widgets.push({
    id: "total_responses",
    type: "stat_card",
    title: "Total Responses",
    priority: priority++,
    size: "small",
    data: {
      value: analytics.coreMetrics.totalConversations,
      label: "conversations",
      icon: "users",
    } as StatCardData,
  });

  widgets.push({
    id: "completion_rate",
    type: "stat_card",
    title: "Completion Rate",
    priority: priority++,
    size: "small",
    data: {
      value: `${analytics.coreMetrics.completionRate}%`,
      label: "completed",
      trend:
        analytics.coreMetrics.completionRate >= 80
          ? "up"
          : analytics.coreMetrics.completionRate >= 50
            ? "stable"
            : "down",
      icon: "check-circle",
    } as StatCardData,
  });

  widgets.push({
    id: "insight_quality",
    type: "stat_card",
    title: "Insight Quality",
    priority: priority++,
    size: "small",
    data: {
      value: `${analytics.coreMetrics.insightQualityScore}/10`,
      label: "quality score",
      icon: "star",
    } as StatCardData,
  });

  widgets.push({
    id: "goal_achievement",
    type: "stat_card",
    title: "Goal Achievement",
    priority: priority++,
    size: "small",
    data: {
      value: `${analytics.goalAssessment.achievementScore}/10`,
      label: analytics.goalAssessment.achievementLevel.replace("_", " "),
      trend:
        analytics.goalAssessment.achievementScore >= 7
          ? "up"
          : analytics.goalAssessment.achievementScore >= 5
            ? "stable"
            : "down",
      icon: "target",
    } as StatCardData,
  });

  // 2. Sentiment Gauge
  widgets.push({
    id: "overall_sentiment",
    type: "sentiment_gauge",
    title: "Overall Sentiment",
    priority: priority++,
    size: "medium",
    data: analytics.executiveSummary.overallSentiment,
  });

  // 3. Engagement Distribution
  widgets.push({
    id: "engagement_distribution",
    type: "pie_chart",
    title: "Response Engagement",
    description: "Distribution of participant engagement levels",
    priority: priority++,
    size: "medium",
    data: {
      segments: [
        {
          label: "High Engagement",
          value: analytics.coreMetrics.responseEngagementDistribution.high,
          color: "#22c55e",
        },
        {
          label: "Medium Engagement",
          value: analytics.coreMetrics.responseEngagementDistribution.medium,
          color: "#eab308",
        },
        {
          label: "Low Engagement",
          value: analytics.coreMetrics.responseEngagementDistribution.low,
          color: "#ef4444",
        },
      ],
    } as PieChartData,
  });

  // 4. Key Insights List
  widgets.push({
    id: "key_insights",
    type: "insight_list",
    title: "Key Insights",
    description: "Most important findings from all conversations",
    priority: priority++,
    size: "large",
    data: {
      insights: analytics.executiveSummary.keyInsights.map((text, i) => ({
        text,
        significance:
          i < 3 ? "high" : i < 6 ? "medium" : ("low" as InsightSignificance),
      })),
    } as InsightListData,
  });

  // 5. Required Questions Coverage
  if (analytics.coreMetrics.requiredQuestionsCompletion.length > 0) {
    widgets.push({
      id: "question_coverage",
      type: "coverage_matrix",
      title: "Required Questions Coverage",
      description: "How well each required question was answered",
      priority: priority++,
      size: "large",
      data: analytics.coreMetrics.requiredQuestionsCompletion,
    });
  }

  // 6. Creator Metrics (one widget per metric)
  for (const metric of analytics.creatorMetrics) {
    widgets.push({
      id: `metric_${metric.name.toLowerCase().replace(/\s+/g, "_")}`,
      type:
        metric.chartType === "pie"
          ? "pie_chart"
          : metric.chartType === "bar"
            ? "bar_chart"
            : "metric_breakdown",
      title: metric.name,
      description: metric.summary,
      priority: priority++,
      size: "medium",
      data:
        metric.chartType === "pie"
          ? {
              segments: metric.chartData.map((d) => ({
                label: d.label,
                value: d.value,
                color: d.color,
              })),
            }
          : metric.chartData,
    });
  }

  // 7. Hypothesis Validations
  for (const hypothesis of analytics.hypothesisValidations) {
    widgets.push({
      id: `hypothesis_${generateInsightId("hyp")}`,
      type: "hypothesis_card",
      title: "Hypothesis Validation",
      priority: priority++,
      size: "medium",
      data: hypothesis,
    });
  }

  // 8. AI Discovered Trends
  if (analytics.discoveredInsights.trends.length > 0) {
    widgets.push({
      id: "discovered_trends",
      type: "insight_list",
      title: "Discovered Patterns & Trends",
      description: "Insights the AI identified beyond what was asked",
      priority: priority++,
      size: "large",
      data: {
        insights: analytics.discoveredInsights.trends.map((t) => ({
          text: `${t.title}: ${t.description} (${t.frequencyPercentage}% of responses)`,
          significance: t.significance,
        })),
      } as InsightListData,
    });
  }

  // 9. Notable Quotes Carousel
  const allQuotes = analytics.discoveredInsights.trends
    .flatMap((t) => t.supportingQuotes)
    .slice(0, 10);

  if (allQuotes.length > 0) {
    widgets.push({
      id: "notable_quotes",
      type: "quote_carousel",
      title: "Notable Participant Quotes",
      priority: priority++,
      size: "large",
      data: {
        quotes: allQuotes,
      } as QuoteCarouselData,
    });
  }

  // 10. Recommendations
  if (analytics.discoveredInsights.recommendations.length > 0) {
    widgets.push({
      id: "recommendations",
      type: "recommendation_card",
      title: "Recommended Actions",
      description: "AI-generated recommendations based on the data",
      priority: priority++,
      size: "full",
      data: analytics.discoveredInsights.recommendations,
    });
  }

  // 11. Insight Types Collected (for goal assessment)
  widgets.push({
    id: "insight_types",
    type: "bar_chart",
    title: "Insight Types Collected",
    description: "Breakdown of emotional, behavioral, and rational insights",
    priority: priority++,
    size: "medium",
    data: {
      bars: [
        {
          label: "Emotional",
          value: analytics.goalAssessment.insightTypesCollected.emotional.count,
          color: "#ec4899",
        },
        {
          label: "Behavioral",
          value:
            analytics.goalAssessment.insightTypesCollected.behavioral.count,
          color: "#8b5cf6",
        },
        {
          label: "Rational",
          value: analytics.goalAssessment.insightTypesCollected.rational.count,
          color: "#3b82f6",
        },
      ],
      yAxisLabel: "Count",
    } as BarChartData,
  });

  // 12. Media Analytics (if survey has media)
  if (
    analytics.mediaAnalytics &&
    analytics.mediaAnalytics.totalMediaAssets > 0
  ) {
    const media = analytics.mediaAnalytics;

    // Media overview stat card
    widgets.push({
      id: "media_overview",
      type: "stat_card",
      title: "Media Assets",
      priority: priority++,
      size: "small",
      data: {
        value: media.totalMediaAssets,
        label: `${media.mediaByType.images} img, ${media.mediaByType.video} vid, ${media.mediaByType.audio} aud`,
        icon: "image",
      } as StatCardData,
    });

    // Media usage rate
    widgets.push({
      id: "media_usage_rate",
      type: "stat_card",
      title: "Media Usage Rate",
      priority: priority++,
      size: "small",
      data: {
        value: `${Math.round(media.overallUsageRate)}%`,
        label: "of media was referenced",
        trend:
          media.overallUsageRate >= 70
            ? "up"
            : media.overallUsageRate >= 40
              ? "stable"
              : "down",
        icon: "play-circle",
      } as StatCardData,
    });

    // Media effectiveness breakdown (if there are multiple media)
    if (media.mediaEffectiveness.length > 0) {
      widgets.push({
        id: "media_effectiveness",
        type: "media_effectiveness",
        title: "Media Effectiveness",
        description: "How well each media asset performed",
        priority: priority++,
        size: "large",
        data: media.mediaEffectiveness.map((m) => ({
          mediaId: m.mediaId,
          type: m.mediaType,
          description: m.description,
          usageRate: m.usageRate,
          effectivenessScore: m.effectivenessScore,
          effectivenessLevel: m.effectivenessLevel,
          insightsGenerated: m.insightsGeneratedCount,
          recommendation: m.recommendation,
        })),
      });

      // Top performing media card
      const topMedia = media.mediaEffectiveness
        .filter((m) => m.effectivenessLevel !== "unused")
        .sort((a, b) => b.effectivenessScore - a.effectivenessScore)[0];

      if (topMedia) {
        widgets.push({
          id: "top_media",
          type: "media_card",
          title: "Top Performing Media",
          description: topMedia.recommendation,
          priority: priority++,
          size: "medium",
          data: {
            mediaId: topMedia.mediaId,
            type: topMedia.mediaType,
            description: topMedia.description,
            effectivenessScore: topMedia.effectivenessScore,
            usageRate: topMedia.usageRate,
            insightsGenerated: topMedia.insightsGeneratedCount,
            topQuotes: topMedia.topQuotes.slice(0, 3),
          },
        });
      }

      // Media with issues alert
      const mediaWithIssues = media.mediaEffectiveness.filter(
        (m) => m.commonIssues.length > 0
      );
      if (mediaWithIssues.length > 0) {
        widgets.push({
          id: "media_issues",
          type: "insight_list",
          title: "Media Issues Detected",
          description: "These media assets may need attention",
          priority: priority++,
          size: "medium",
          data: {
            insights: mediaWithIssues
              .flatMap((m) =>
                m.commonIssues.map((issue) => ({
                  text: `${m.mediaType.toUpperCase()} "${m.description.slice(0, 30)}...": ${issue}`,
                  significance: "high" as InsightSignificance,
                }))
              )
              .slice(0, 5),
          } as InsightListData,
        });
      }
    }

    // Media recommendations
    if (media.mediaRecommendations.length > 0) {
      widgets.push({
        id: "media_recommendations",
        type: "recommendation_card",
        title: "Media Recommendations",
        description: "Suggestions for improving media effectiveness",
        priority: priority++,
        size: "medium",
        data: media.mediaRecommendations.map((r) => ({
          id: `media_rec_${r.mediaId || "general"}`,
          type: r.type,
          title:
            r.type === "remove"
              ? "Consider Removing"
              : r.type === "improve"
                ? "Needs Improvement"
                : r.type === "add"
                  ? "Consider Adding"
                  : "Keep Using",
          description: r.description,
          priority: r.priority,
          basedOn: r.reason,
        })),
      });
    }
  }

  return widgets;
}

/**
 * Validate and parse AI-generated analytics JSON
 * Returns validated data or fallback with error logging
 */
export function parseAnalyticsResponse<T>(
  response: string,
  schema: z.ZodType<T>,
  fallback: T,
  context: string
): { data: T; parseSuccess: boolean } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[Analytics Parser] No JSON found in ${context} response`);
      return { data: fallback, parseSuccess: false };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = schema.parse(parsed);
    return { data: validated, parseSuccess: true };
  } catch (error) {
    console.error(`[Analytics Parser] Failed to parse ${context}:`, error);
    return { data: fallback, parseSuccess: false };
  }
}

/**
 * Create fallback conversation insights when AI parsing fails
 */
export function createFallbackConversationInsights(
  conversationId: string,
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>,
  rawSummary: string
): ConversationInsightData {
  const participantMessages = messages.filter((m) => m.role === "user");
  const totalWords = participantMessages.reduce(
    (sum, m) => sum + m.content.split(/\s+/).length,
    0
  );
  const averageResponseLength =
    participantMessages.length > 0
      ? Math.round(totalWords / participantMessages.length)
      : 0;

  const metrics = calculateConversationMetrics(messages);
  const engagementLevel = determineEngagementLevel(
    averageResponseLength,
    metrics.followUpDepth,
    metrics.participantResponseCount
  );

  return {
    conversationId,
    summary: rawSummary,
    keyFindings: [rawSummary.slice(0, 200)],
    ...metrics,
    engagementLevel,
    responseQuality: 5, // Neutral fallback
    topicsCovered: [],
    requiredQuestionsCovered: [],
    requiredQuestionsMissed: [],
    sentiment: {
      overall: "neutral",
      score: 0,
      confidence: 0.5,
    },
    extractedMetrics: {},
    notableQuotes: [],
    hypothesisEvidence: [],
    averageResponseLength, // calculated above
    mediaInteractions: [],
  };
}

/**
 * Aggregate media interactions from conversations into survey-level metrics
 */
export function aggregateMediaInteractions(
  conversationInsights: ConversationInsightData[],
  surveyMedia: Array<{
    id: string;
    type: "image" | "audio" | "video";
    description: string;
  }>
): MediaAnalytics | undefined {
  if (!surveyMedia || surveyMedia.length === 0) {
    return undefined;
  }

  const mediaMap = new Map<
    string,
    {
      interactions: MediaInteraction[];
      media: {
        id: string;
        type: "image" | "audio" | "video";
        description: string;
      };
    }
  >();

  // Initialize map with all survey media
  for (const media of surveyMedia) {
    mediaMap.set(media.id, { interactions: [], media });
  }

  // Collect all interactions per media
  for (const insight of conversationInsights) {
    for (const interaction of insight.mediaInteractions || []) {
      const entry = mediaMap.get(interaction.mediaId);
      if (entry) {
        entry.interactions.push(interaction);
      }
    }
  }

  const totalConversations = conversationInsights.length;
  const mediaEffectiveness: MediaEffectivenessMetrics[] = [];

  let totalUsageRate = 0;
  let mediaWithHighEngagement = 0;
  let mediaWithIssues = 0;

  for (const [mediaId, { interactions, media }] of mediaMap) {
    const conversationsWhereAvailable = totalConversations;
    const conversationsWhereReferenced = interactions.filter(
      (i) => i.wasReferenced
    ).length;
    const usageRate =
      conversationsWhereAvailable > 0
        ? Math.round(
            (conversationsWhereReferenced / conversationsWhereAvailable) * 100
          )
        : 0;

    const engagedInteractions = interactions.filter(
      (i) => i.participantEngaged
    );
    const participantEngagementRate =
      conversationsWhereReferenced > 0
        ? Math.round(
            (engagedInteractions.length / conversationsWhereReferenced) * 100
          )
        : 0;

    const clarityScores = interactions
      .filter((i) => i.clarityScore > 0)
      .map((i) => i.clarityScore);
    const averageClarityScore =
      clarityScores.length > 0
        ? Math.round(
            (clarityScores.reduce((a, b) => a + b, 0) / clarityScores.length) *
              10
          ) / 10
        : 0;

    // Reaction breakdown
    const reactionBreakdown = {
      positive: interactions.filter((i) => i.participantReaction === "positive")
        .length,
      negative: interactions.filter((i) => i.participantReaction === "negative")
        .length,
      neutral: interactions.filter((i) => i.participantReaction === "neutral")
        .length,
      confused: interactions.filter((i) => i.participantReaction === "confused")
        .length,
    };

    // Value metrics
    const insightsGeneratedCount = interactions.reduce(
      (sum, i) => sum + i.insightsGenerated.length,
      0
    );
    const highValueInsightsCount = interactions.filter(
      (i) => i.insightQuality === "high"
    ).length;

    // Issues
    const allIssues = interactions.flatMap((i) => i.issuesIdentified);
    const uniqueIssues = [...new Set(allIssues)];
    const issueFrequency =
      interactions.length > 0
        ? Math.round(
            (interactions.filter((i) => i.issuesIdentified.length > 0).length /
              interactions.length) *
              100
          )
        : 0;

    // Calculate effectiveness score (1-10)
    let effectivenessScore = 5; // Base score
    if (usageRate >= 80) effectivenessScore += 1;
    if (participantEngagementRate >= 60) effectivenessScore += 1;
    if (averageClarityScore >= 7) effectivenessScore += 1;
    if (reactionBreakdown.positive > reactionBreakdown.negative)
      effectivenessScore += 1;
    if (highValueInsightsCount > 0) effectivenessScore += 1;
    if (issueFrequency > 30) effectivenessScore -= 2;
    if (usageRate < 30) effectivenessScore -= 2;
    effectivenessScore = Math.max(1, Math.min(10, effectivenessScore));

    const effectivenessLevel: MediaEffectivenessMetrics["effectivenessLevel"] =
      usageRate === 0
        ? "unused"
        : effectivenessScore >= 8
          ? "excellent"
          : effectivenessScore >= 6
            ? "good"
            : effectivenessScore >= 4
              ? "moderate"
              : "poor";

    // Generate recommendation
    let recommendation = "";
    if (effectivenessLevel === "unused") {
      recommendation =
        "This media was never referenced. Consider removing it or providing clearer context for when to use it.";
    } else if (effectivenessLevel === "excellent") {
      recommendation =
        "Highly effective - this media generated valuable insights. Consider using similar media in future surveys.";
    } else if (effectivenessLevel === "good") {
      recommendation =
        "Good performance. This media contributed meaningfully to the survey.";
    } else if (effectivenessLevel === "moderate") {
      recommendation =
        "Moderate effectiveness. Consider improving the media quality or context for when it should be shown.";
    } else {
      recommendation =
        "Poor performance. Review if this media is necessary or if it needs significant improvement.";
    }

    // Collect top quotes
    const topQuotes: ExtractedQuote[] = interactions
      .flatMap((i) =>
        i.responsesAboutMedia.map((text) => ({
          text,
          conversationId: i.mediaId, // Use mediaId as placeholder
          context: `Response to ${media.type}`,
        }))
      )
      .slice(0, 5);

    mediaEffectiveness.push({
      mediaId,
      mediaType: media.type,
      description: media.description,
      conversationsWhereAvailable,
      conversationsWhereReferenced,
      usageRate,
      participantEngagementRate,
      averageClarityScore,
      reactionBreakdown,
      insightsGeneratedCount,
      highValueInsightsCount,
      topQuotes,
      commonIssues: uniqueIssues,
      issueFrequency,
      effectivenessScore,
      effectivenessLevel,
      recommendation,
    });

    totalUsageRate += usageRate;
    if (effectivenessLevel === "excellent" || effectivenessLevel === "good") {
      mediaWithHighEngagement++;
    }
    if (uniqueIssues.length > 0) {
      mediaWithIssues++;
    }
  }

  const overallUsageRate =
    surveyMedia.length > 0
      ? Math.round(totalUsageRate / surveyMedia.length)
      : 0;

  // Find best and worst media
  const sortedByEffectiveness = [...mediaEffectiveness]
    .filter((m) => m.effectivenessLevel !== "unused")
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore);

  const mostEffectiveMedia = sortedByEffectiveness[0]?.mediaId || null;
  const leastEffectiveMedia =
    sortedByEffectiveness.length > 1
      ? sortedByEffectiveness[sortedByEffectiveness.length - 1]?.mediaId
      : null;

  // Generate media recommendations
  const mediaRecommendations: MediaAnalytics["mediaRecommendations"] = [];

  for (const m of mediaEffectiveness) {
    if (m.effectivenessLevel === "unused") {
      mediaRecommendations.push({
        type: "remove",
        mediaId: m.mediaId,
        description: `Remove "${m.description.slice(0, 50)}..." - never used`,
        reason: "This media was never referenced in any conversation",
        priority: "medium",
      });
    } else if (m.effectivenessLevel === "poor") {
      mediaRecommendations.push({
        type: "improve",
        mediaId: m.mediaId,
        description: `Improve "${m.description.slice(0, 50)}..."`,
        reason:
          m.commonIssues.length > 0
            ? `Issues: ${m.commonIssues.join(", ")}`
            : "Low engagement and unclear value",
        priority: "high",
      });
    }
  }

  return {
    totalMediaAssets: surveyMedia.length,
    mediaByType: {
      images: surveyMedia.filter((m) => m.type === "image").length,
      audio: surveyMedia.filter((m) => m.type === "audio").length,
      video: surveyMedia.filter((m) => m.type === "video").length,
    },
    overallUsageRate,
    mediaWithHighEngagement,
    mediaWithIssues,
    mediaEffectiveness,
    mediaInsights: {
      mostEffectiveMedia,
      leastEffectiveMedia,
      topMediaInsight: sortedByEffectiveness[0]
        ? `${sortedByEffectiveness[0].mediaType} generated ${sortedByEffectiveness[0].insightsGeneratedCount} insights`
        : "No media insights available",
      mediaImpactSummary: `${mediaWithHighEngagement} of ${surveyMedia.length} media assets performed well. Overall usage rate: ${overallUsageRate}%.`,
    },
    mediaRecommendations,
  };
}

/**
 * Aggregate conversation insights into survey-level analytics
 */
export function aggregateConversationInsights(
  conversationInsights: ConversationInsightData[]
): Partial<CoreMetrics> {
  const total = conversationInsights.length;
  if (total === 0) {
    return {
      totalConversations: 0,
      completedConversations: 0,
      completionRate: 0,
      averageMessagesPerConversation: 0,
      averageFollowUpDepth: 0,
      medianDurationMinutes: 0,
      insightQualityScore: 0,
      responseEngagementDistribution: { high: 0, medium: 0, low: 0 },
    };
  }

  const engagementCounts = { high: 0, medium: 0, low: 0 };
  let totalMessages = 0;
  let totalResponseLength = 0;
  let totalFollowUpDepth = 0;
  let totalQuality = 0;
  const durations: number[] = [];

  for (const insight of conversationInsights) {
    engagementCounts[insight.engagementLevel]++;
    totalMessages += insight.messageCount;
    totalResponseLength += insight.averageResponseLength || 0;
    totalFollowUpDepth += insight.followUpDepth;
    totalQuality += insight.responseQuality;
    durations.push(insight.durationMinutes);
  }

  // Calculate median duration
  durations.sort((a, b) => a - b);
  const medianDuration =
    durations.length > 0
      ? durations.length % 2 === 0
        ? (durations[durations.length / 2 - 1] +
            durations[durations.length / 2]) /
          2
        : durations[Math.floor(durations.length / 2)]
      : 0;

  // Calculate median active duration
  const activeDurations: number[] = conversationInsights
    .map((i) => i.activeDurationMinutes || i.durationMinutes) // Fallback to durationMinutes
    .sort((a, b) => a - b);
    
  const medianActiveDuration =
    activeDurations.length > 0
      ? activeDurations.length % 2 === 0
        ? (activeDurations[activeDurations.length / 2 - 1] +
            activeDurations[activeDurations.length / 2]) /
          2
        : activeDurations[Math.floor(activeDurations.length / 2)]
      : 0;

  return {
    totalConversations: total,
    completedConversations: total,
    completionRate: 100,
    averageMessagesPerConversation: Math.round(totalMessages / total),
    averageResponseLength: Math.round(totalResponseLength / total),
    averageFollowUpDepth: Math.round((totalFollowUpDepth / total) * 10) / 10,
    medianDurationMinutes: Math.round(medianDuration * 10) / 10,
    medianActiveDurationMinutes: Math.round(medianActiveDuration * 10) / 10,
    insightQualityScore: Math.round((totalQuality / total) * 10) / 10,
    responseEngagementDistribution: engagementCounts,
  };
}

// ============================================================================
// ANALYTICS DATA VERSION
// ============================================================================

export const ANALYTICS_DATA_VERSION = "2.0.0";
