import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  conversationInsights,
  surveyAnalytics,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { SurveyAnalyticsJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";
import {
  getSurveyAnalyticsPrompt,
  type SurveyAnalyticsAIResponse,
} from "@/lib/analytics-prompts";
import {
  aggregateConversationInsights,
  aggregateMediaInteractions,
  createDashboardWidgets,
  ANALYTICS_DATA_VERSION,
  type SurveyAnalyticsData,
  type CoreMetrics,
  type RequiredQuestionCoverage,
  type ConversationInsightData,
  type MediaInteraction,
} from "@/lib/analytics";

const jobDataSchema = z.object({
  surveyId: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Transform stored conversation insights to the format needed for aggregation
 */
function transformStoredInsights(
  conversationId: string,
  storedInsights: Record<string, unknown>,
  keyFindings: string | null,
): Partial<ConversationInsightData> {
  return {
    conversationId,
    summary: (storedInsights.summary as string) || "",
    keyFindings: keyFindings ? keyFindings.split("\n\n") : [],
    messageCount: (storedInsights.messageCount as number) || 0,
    participantResponseCount:
      (storedInsights.participantResponseCount as number) || 0,
    averageResponseLength:
      (storedInsights.averageResponseLength as number) || 0,
    durationMinutes: (storedInsights.durationMinutes as number) || 0,
    activeDurationMinutes:
      (storedInsights.activeDurationMinutes as number) || 0,
    followUpDepth: (storedInsights.followUpDepth as number) || 0,
    engagementLevel:
      (storedInsights.engagementLevel as "high" | "medium" | "low") || "medium",
    responseQuality: (storedInsights.responseQuality as number) || 5,
    topicsCovered: (storedInsights.topicsCovered as string[]) || [],
    requiredQuestionsCovered:
      (storedInsights.requiredQuestionsCovered as string[]) || [],
    requiredQuestionsMissed:
      (storedInsights.requiredQuestionsMissed as string[]) || [],
    sentiment:
      (storedInsights.sentiment as ConversationInsightData["sentiment"]) || {
        overall: "neutral",
        score: 0,
        confidence: 0.5,
      },
    extractedMetrics:
      (storedInsights.extractedMetrics as Record<
        string,
        string | number | boolean
      >) || {},
    notableQuotes:
      (storedInsights.notableQuotes as ConversationInsightData["notableQuotes"]) ||
      [],
    hypothesisEvidence:
      (storedInsights.hypothesisEvidence as ConversationInsightData["hypothesisEvidence"]) ||
      [],
    mediaInteractions:
      (storedInsights.mediaInteractions as MediaInteraction[]) || [],
  };
}

/**
 * Parse AI response for survey analytics
 */
function parseSurveyAnalyticsResponse(
  response: string,
  surveyId: string,
  surveyTitle: string,
  coreMetrics: Partial<CoreMetrics>,
  requiredQuestions: string[],
  coreObjective?: string,
  expertState?: Record<string, any>,
  mediaAnalytics?: SurveyAnalyticsData["mediaAnalytics"],
): SurveyAnalyticsData | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        `[Survey Analytics Worker] No JSON found in response for ${surveyId}`,
      );
      return null;
    }

    const parsed: SurveyAnalyticsAIResponse = JSON.parse(jsonMatch[0]);

    // Construct the full analytics data object
    const analyticsData: SurveyAnalyticsData = {
      // Metadata
      surveyId,
      surveyTitle,
      generatedAt: new Date().toISOString(),
      dataVersion: ANALYTICS_DATA_VERSION,

      // Executive Summary
      executiveSummary: {
        headline:
          parsed.executiveSummary?.headline || "Survey analysis complete",
        keyInsights: parsed.executiveSummary?.keyInsights || [],
        overallSentiment: {
          overall:
            (parsed.executiveSummary?.overallSentiment?.overall as
              | "positive"
              | "negative"
              | "neutral"
              | "mixed") || "neutral",
          score: parsed.executiveSummary?.overallSentiment?.score || 0,
          confidence:
            parsed.executiveSummary?.overallSentiment?.confidence || 0.5,
        },
        recommendedActions: parsed.executiveSummary?.recommendedActions || [],
      },

      // Core Metrics (calculated + AI-enhanced)
      coreMetrics: {
        totalConversations: coreMetrics.totalConversations || 0,
        completedConversations: coreMetrics.completedConversations || 0,
        completionRate: coreMetrics.completionRate || 0,
        averageMessagesPerConversation:
          coreMetrics.averageMessagesPerConversation || 0,
        averageResponseLength: coreMetrics.averageResponseLength || 0,
        averageFollowUpDepth: coreMetrics.averageFollowUpDepth || 0,
        medianDurationMinutes: coreMetrics.medianDurationMinutes || 0,
        medianActiveDurationMinutes:
          coreMetrics.medianActiveDurationMinutes || 0,
        insightQualityScore: coreMetrics.insightQualityScore || 5,
        responseEngagementDistribution:
          coreMetrics.responseEngagementDistribution || {
            high: 0,
            medium: 0,
            low: 0,
          },
        topicCoverageRate: coreMetrics.topicCoverageRate || 0,
        requiredQuestionsCompletion: transformRequiredQuestionsCompletion(
          parsed.requiredQuestionsCompletion || [],
          requiredQuestions,
        ),
      },

      // Creator-defined metrics
      creatorMetrics: (parsed.creatorMetrics || []).map((m) => ({
        name: m.name,
        type: m.type as
          | "categorical"
          | "numeric"
          | "sentiment"
          | "boolean"
          | "text",
        description: m.description,
        values: m.values.map((v) => ({
          value: v.value,
          count: v.count,
          percentage: v.percentage,
          examples: v.examples.map((e) => ({
            text: e.text,
            conversationId: e.conversationId,
          })),
        })),
        summary: m.summary,
        chartType: m.chartType as
          | "pie"
          | "bar"
          | "histogram"
          | "wordcloud"
          | "text",
        chartData: m.chartData,
      })),

      // Hypothesis validations
      hypothesisValidations: (parsed.hypothesisValidations || []).map((h) => ({
        hypothesis: h.hypothesis,
        status: h.status as
          | "validated"
          | "refuted"
          | "mixed"
          | "insufficient_data",
        confidence: h.confidence,
        supportingCount: h.supportingCount,
        contradictingCount: h.contradictingCount,
        supportingEvidence: h.supportingEvidence.map((e) => ({
          quote: e.quote,
          conversationId: e.conversationId,
          type: "supporting" as const,
        })),
        contradictingEvidence: h.contradictingEvidence.map((e) => ({
          quote: e.quote,
          conversationId: e.conversationId,
          type: "contradicting" as const,
        })),
        summary: h.summary,
        recommendation: h.recommendation,
      })),

      // AI-Discovered insights
      discoveredInsights: {
        trends: (parsed.discoveredInsights?.trends || []).map((t) => ({
          id: t.id,
          type: t.type as
            | "trend"
            | "pattern"
            | "outlier"
            | "correlation"
            | "gap",
          title: t.title,
          description: t.description,
          frequency: t.frequency,
          frequencyPercentage: t.frequencyPercentage,
          significance: t.significance as "high" | "medium" | "low",
          sentiment: t.sentiment as
            | "positive"
            | "negative"
            | "neutral"
            | undefined,
          supportingQuotes: t.supportingQuotes.map((q) => ({
            text: q.text,
            conversationId: q.conversationId,
            sentiment: q.sentiment as
              | "positive"
              | "negative"
              | "neutral"
              | undefined,
          })),
          relatedTopics: t.relatedTopics,
        })),
        outliers: (parsed.discoveredInsights?.outliers || []).map((o) => ({
          id: o.id,
          conversationId: o.conversationId,
          description: o.description,
          whyNotable: o.whyNotable,
          quote: o.quote,
          significance: o.significance as "high" | "medium" | "low",
        })),
        recommendations: (parsed.discoveredInsights?.recommendations || []).map(
          (r) => ({
            id: r.id,
            type: r.type as
              | "action"
              | "follow_up_survey"
              | "product_change"
              | "process_improvement",
            title: r.title,
            description: r.description,
            priority: r.priority as "high" | "medium" | "low",
            basedOn: r.basedOn,
            expectedImpact: r.expectedImpact,
          }),
        ),
        emergentTopics: (parsed.discoveredInsights?.emergentTopics || []).map(
          (e) => ({
            topic: e.topic,
            mentionCount: e.mentionCount,
            mentionPercentage: e.mentionPercentage,
            sentiment: e.sentiment as
              | "positive"
              | "negative"
              | "neutral"
              | "mixed",
            isUnexpected: e.isUnexpected,
            relatedQuotes: e.relatedQuotes.map((q) => ({
              text: q.text,
              conversationId: q.conversationId,
            })),
            suggestion: e.suggestion,
          }),
        ),
        surprisingFindings: parsed.discoveredInsights?.surprisingFindings || [],
        dataGaps: parsed.discoveredInsights?.dataGaps || [],
      },

      // Goal assessment
      goalAssessment: {
        surveyObjective:
          parsed.goalAssessment?.surveyObjective ||
          coreObjective ||
          expertState?.objective?.goal ||
          "",
        achievementScore: parsed.goalAssessment?.achievementScore || 5,
        achievementLevel:
          (parsed.goalAssessment?.achievementLevel as
            | "exceeded"
            | "met"
            | "partially_met"
            | "not_met") || "partially_met",
        insightTypesCollected: {
          emotional: {
            collected:
              parsed.goalAssessment?.insightTypesCollected?.emotional
                ?.collected || false,
            count:
              parsed.goalAssessment?.insightTypesCollected?.emotional?.count ||
              0,
            quality:
              (parsed.goalAssessment?.insightTypesCollected?.emotional
                ?.quality as "high" | "medium" | "low") || "medium",
            examples:
              parsed.goalAssessment?.insightTypesCollected?.emotional
                ?.examples || [],
          },
          behavioral: {
            collected:
              parsed.goalAssessment?.insightTypesCollected?.behavioral
                ?.collected || false,
            count:
              parsed.goalAssessment?.insightTypesCollected?.behavioral?.count ||
              0,
            quality:
              (parsed.goalAssessment?.insightTypesCollected?.behavioral
                ?.quality as "high" | "medium" | "low") || "medium",
            examples:
              parsed.goalAssessment?.insightTypesCollected?.behavioral
                ?.examples || [],
          },
          rational: {
            collected:
              parsed.goalAssessment?.insightTypesCollected?.rational
                ?.collected || false,
            count:
              parsed.goalAssessment?.insightTypesCollected?.rational?.count ||
              0,
            quality:
              (parsed.goalAssessment?.insightTypesCollected?.rational
                ?.quality as "high" | "medium" | "low") || "medium",
            examples:
              parsed.goalAssessment?.insightTypesCollected?.rational
                ?.examples || [],
          },
        },
        successfulAspects: parsed.goalAssessment?.successfulAspects || [],
        gapsIdentified: parsed.goalAssessment?.gapsIdentified || [],
        recommendedNextSteps: parsed.goalAssessment?.recommendedNextSteps || [],
        suggestedFollowUpQuestions:
          parsed.goalAssessment?.suggestedFollowUpQuestions || [],
      },

      // Media analytics (if survey has media)
      mediaAnalytics,

      // Dashboard widgets (generated after parsing)
      dashboardWidgets: [],
      conversationCount: coreMetrics.totalConversations || 0,
      lastUpdated: new Date().toISOString(),
    };

    // Generate dashboard widgets (includes media widgets if media exists)
    analyticsData.dashboardWidgets = createDashboardWidgets(analyticsData);

    return analyticsData;
  } catch (error) {
    console.error(
      `[Survey Analytics Worker] Failed to parse AI response for ${surveyId}:`,
      error,
    );
    return null;
  }
}

/**
 * Transform required questions completion data
 */
function transformRequiredQuestionsCompletion(
  aiData: Array<{
    question: string;
    coverageRate: number;
    qualityScore: number;
    sampleResponses: string[];
  }>,
  requiredQuestions: string[],
): RequiredQuestionCoverage[] {
  // Create a map of AI-provided data
  const aiDataMap = new Map(aiData.map((d) => [d.question.toLowerCase(), d]));

  // Ensure all required questions are represented
  return requiredQuestions.map((question) => {
    const aiMatch = aiDataMap.get(question.toLowerCase());
    if (aiMatch) {
      return {
        question,
        coverageRate: aiMatch.coverageRate,
        qualityScore: aiMatch.qualityScore,
        sampleResponses: aiMatch.sampleResponses.slice(0, 3),
      };
    }
    return {
      question,
      coverageRate: 0,
      qualityScore: 0,
      sampleResponses: [],
    };
  });
}

/**
 * Create fallback analytics when AI parsing fails
 */
function createFallbackAnalytics(
  surveyId: string,
  surveyTitle: string,
  coreMetrics: Partial<CoreMetrics>,
  rawSummary: string,
): SurveyAnalyticsData {
  const fallback: SurveyAnalyticsData = {
    surveyId,
    surveyTitle,
    generatedAt: new Date().toISOString(),
    dataVersion: ANALYTICS_DATA_VERSION,

    executiveSummary: {
      headline: "Survey analysis generated",
      keyInsights: [rawSummary],
      overallSentiment: { overall: "neutral", score: 0, confidence: 0.5 },
      recommendedActions: [],
    },

    coreMetrics: {
      totalConversations: coreMetrics.totalConversations || 0,
      completedConversations: coreMetrics.completedConversations || 0,
      completionRate: coreMetrics.completionRate || 0,
      averageMessagesPerConversation:
        coreMetrics.averageMessagesPerConversation || 0,
      averageResponseLength: coreMetrics.averageResponseLength || 0,
      averageFollowUpDepth: coreMetrics.averageFollowUpDepth || 0,
      medianDurationMinutes: coreMetrics.medianDurationMinutes || 0,
      medianActiveDurationMinutes: coreMetrics.medianActiveDurationMinutes || 0,
      insightQualityScore: coreMetrics.insightQualityScore || 5,
      responseEngagementDistribution:
        coreMetrics.responseEngagementDistribution || {
          high: 0,
          medium: 0,
          low: 0,
        },
      topicCoverageRate: coreMetrics.topicCoverageRate || 0,
      requiredQuestionsCompletion: [],
    },

    creatorMetrics: [],
    hypothesisValidations: [],

    discoveredInsights: {
      trends: [],
      outliers: [],
      recommendations: [],
      emergentTopics: [],
      surprisingFindings: [],
      dataGaps: ["AI analysis parsing failed - raw summary available"],
    },

    goalAssessment: {
      surveyObjective: "",
      achievementScore: 5,
      achievementLevel: "partially_met",
      insightTypesCollected: {
        emotional: { collected: false, count: 0, quality: "low", examples: [] },
        behavioral: {
          collected: false,
          count: 0,
          quality: "low",
          examples: [],
        },
        rational: { collected: false, count: 0, quality: "low", examples: [] },
      },
      successfulAspects: [],
      gapsIdentified: [],
      recommendedNextSteps: [],
      suggestedFollowUpQuestions: [],
    },

    dashboardWidgets: [],
    conversationCount: coreMetrics.totalConversations || 0,
    lastUpdated: new Date().toISOString(),
  };

  fallback.dashboardWidgets = createDashboardWidgets(fallback);
  return fallback;
}

/**
 * Worker for generating survey analytics
 * Aggregates all conversations and generates comprehensive analytics
 */
const surveyAnalyticsWorker = new Worker<SurveyAnalyticsJobData>(
  "survey-analytics",
  async (job: Job<SurveyAnalyticsJobData>) => {
    const validatedData = jobDataSchema.parse(job.data);
    const { surveyId, userId } = validatedData;

    // Get creator's preferred language for analytics generation
    const { getUserPreferredLanguage } =
      await import("@/lib/translation-service");
    const creatorLanguage = await getUserPreferredLanguage(userId);

    console.log(
      `[Survey Analytics Worker] Processing job ${job.id} for survey ${surveyId}`,
    );

    // Fetch survey
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      throw new Error(`Survey ${surveyId} not found`);
    }

    // Only generate analytics for active surveys
    if (survey.status !== "active") {
      console.log(
        `[Survey Analytics Worker] Survey ${surveyId} is not active (${survey.status}). Skipping analytics generation.`,
      );
      return;
    }

    await job.updateProgress(10);

    // Fetch all conversations with their insights
    const conversations = await db
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
        rawConversation: surveyConversations.rawConversation,
        completed: surveyConversations.completed,
        insights: conversationInsights.insights,
        keyFindings: conversationInsights.keyFindings,
      })
      .from(surveyConversations)
      .leftJoin(
        conversationInsights,
        eq(conversationInsights.conversationId, surveyConversations.id),
      )
      .where(eq(surveyConversations.surveyId, surveyId));

    const completedConversations = conversations.filter((c) => c.summary);

    // Issue 4 Fix: Don't throw error, just continue with empty/zero metrics
    // if no conversations are completed yet. This prevents "Locked Dashboard"
    // and worker retry loops.
    if (completedConversations.length === 0 && conversations.length === 0) {
      console.log(
        `[Survey Analytics Worker] No conversations found for survey ${surveyId}.`,
      );
      // Update with zero-state metrics
      // (Optional: handle empty-state specialized response here)
    }

    await job.updateProgress(20);

    // Build survey config
    const surveyConfig = buildCompleteSurveyConfig(survey);

    // Transform stored insights to our format
    const conversationInsightsData = completedConversations.map((conv) => {
      if (conv.insights) {
        return transformStoredInsights(
          conv.id,
          conv.insights as Record<string, unknown>,
          conv.keyFindings,
        );
      }
      // Fallback for conversations without structured insights
      return {
        conversationId: conv.id,
        summary: conv.summary || "",
        keyFindings: conv.keyFindings ? conv.keyFindings.split("\n\n") : [],
        messageCount: conv.rawConversation?.length || 0,
        participantResponseCount:
          conv.rawConversation?.filter((m) => m.role === "user").length || 0,
        averageResponseLength: 0,
        durationMinutes: 0,
        followUpDepth: 0,
        engagementLevel: "medium" as const,
        responseQuality: 5,
        topicsCovered: [],
        requiredQuestionsCovered: [],
        requiredQuestionsMissed: [],
        sentiment: { overall: "neutral" as const, score: 0, confidence: 0.5 },
        extractedMetrics: {},
        notableQuotes: [],
        hypothesisEvidence: [],
      };
    });

    await job.updateProgress(30);

    // Calculate core metrics from aggregated data
    const coreMetrics = aggregateConversationInsights(
      conversationInsightsData as ConversationInsightData[],
    );

    // Add total conversations count (including incomplete)
    coreMetrics.totalConversations = conversations.length;
    coreMetrics.completedConversations = completedConversations.length;
    coreMetrics.completionRate =
      conversations.length > 0
        ? Math.round(
            (completedConversations.length / conversations.length) * 100,
          )
        : 0;

    await job.updateProgress(40);

    // Aggregate media interactions from all conversations
    const surveyMedia =
      surveyConfig.media?.map((m) => ({
        id: m.id,
        type: m.type,
        description: m.description,
      })) || [];

    const mediaAnalytics = aggregateMediaInteractions(
      conversationInsightsData as ConversationInsightData[],
      surveyMedia,
    );

    // Prepare data for AI aggregation
    const insightsForAI = conversationInsightsData.map((insight) => ({
      id: insight.conversationId!,
      summary: insight.summary!,
      keyFindings: insight.keyFindings || [],
      sentiment: insight.sentiment!,
      extractedMetrics: insight.extractedMetrics || {},
      notableQuotes: (insight.notableQuotes || []).map((q) => ({
        text: q.text,
        context: q.context,
        sentiment: q.sentiment,
      })),
      hypothesisEvidence: insight.hypothesisEvidence || [],
      engagementLevel: insight.engagementLevel!,
      topicsCovered: insight.topicsCovered || [],
      mediaInteractions:
        insight.mediaInteractions?.map((m) => ({
          mediaId: m.mediaId,
          mediaType: m.mediaType,
          wasReferenced: m.wasReferenced,
          participantEngaged: m.participantEngaged,
          participantReaction: m.participantReaction,
          clarityScore: m.clarityScore,
          insightQuality: m.insightQuality,
          responsesAboutMedia: m.responsesAboutMedia,
          issuesIdentified: m.issuesIdentified,
        })) || [],
    }));

    await job.updateProgress(50);

    // Generate comprehensive analytics via AI
    const analyticsPrompt = getSurveyAnalyticsPrompt(
      insightsForAI,
      surveyConfig,
      completedConversations.length,
    );

    const analyticsResponse = await generateAIResponse(
      analyticsPrompt,
      undefined,
      {
        model: analysisModel,
        temperature: 0.4,
        maxTokens: 6000,
        userId: userId,
        surveyId: surveyId,
      },
    );

    await job.updateProgress(75);

    // Parse AI response
    let analyticsData = parseSurveyAnalyticsResponse(
      analyticsResponse,
      surveyId,
      survey.title,
      coreMetrics,
      surveyConfig.requiredQuestions,
      surveyConfig.coreObjective,
      surveyConfig.expertState,
      mediaAnalytics,
    );

    // Fallback if parsing failed
    if (!analyticsData) {
      console.warn(
        `[Survey Analytics Worker] AI parsing failed, creating fallback analytics for ${surveyId}`,
      );
      analyticsData = createFallbackAnalytics(
        surveyId,
        survey.title,
        coreMetrics,
        analyticsResponse.slice(0, 1000),
      );
    }

    await job.updateProgress(85);

    // Save to database
    const [existingAnalytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    // Prepare metrics for storage (includes all structured data)
    const metricsForStorage = {
      ...analyticsData,
      // Remove dashboardWidgets from metrics (can be regenerated)
      dashboardWidgets: undefined,
    };

    // Create overall summary from executive summary
    const overallSummary =
      `${analyticsData.executiveSummary.headline}\n\n` +
      `Key Insights:\n${analyticsData.executiveSummary.keyInsights.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}\n\n` +
      `Recommended Actions:\n${analyticsData.executiveSummary.recommendedActions.map((a, idx) => `${idx + 1}. ${a}`).join("\n")}`;

    if (existingAnalytics) {
      await db
        .update(surveyAnalytics)
        .set({
          overallSummary,
          metrics: metricsForStorage,
          totalConversations: analyticsData.coreMetrics.totalConversations,
          averageConversationLength:
            analyticsData.coreMetrics.averageMessagesPerConversation,
          lastUpdated: new Date(),
          generatedLanguage: creatorLanguage,
        })
        .where(eq(surveyAnalytics.surveyId, surveyId));
    } else {
      await db.insert(surveyAnalytics).values({
        id: crypto.randomUUID(),
        surveyId,
        overallSummary,
        metrics: metricsForStorage,
        totalConversations: analyticsData.coreMetrics.totalConversations,
        averageConversationLength:
          analyticsData.coreMetrics.averageMessagesPerConversation,
        generatedLanguage: creatorLanguage,
      });
    }

    await job.updateProgress(95);

    console.log(
      `[Survey Analytics Worker] Completed job ${job.id} for survey ${surveyId}`,
    );
    console.log(
      `[Survey Analytics Worker] Generated: ` +
        `${analyticsData.creatorMetrics.length} metrics, ` +
        `${analyticsData.hypothesisValidations.length} hypothesis validations, ` +
        `${analyticsData.discoveredInsights.trends.length} trends, ` +
        `${analyticsData.discoveredInsights.recommendations.length} recommendations, ` +
        `${analyticsData.dashboardWidgets.length} dashboard widgets`,
    );

    // Reset analytics counter
    try {
      const { resetAnalyticsCounterAfterGeneration } =
        await import("@/lib/analytics-scheduler");
      await resetAnalyticsCounterAfterGeneration(surveyId);
    } catch (error) {
      console.error(
        "[Survey Analytics Worker] Failed to reset analytics counter:",
        error,
      );
    }

    // Trigger RAG ingestion
    try {
      const { ingestAnalytics } = await import("@/lib/rag/ingest");
      await ingestAnalytics(surveyId);
      console.log(
        `[Survey Analytics Worker] Ingested analytics for survey ${surveyId} into RAG`,
      );
    } catch (error) {
      console.error(`[Survey Analytics Worker] RAG ingestion failed:`, error);
    }

    // Publish completion event to Redis pub/sub
    try {
      const redis = getRedisClient();
      const channel = `analytics:complete:${surveyId}:${job.data.userId}`;
      const message = JSON.stringify({
        surveyId,
        userId: job.data.userId,
        completedAt: new Date().toISOString(),
        version: ANALYTICS_DATA_VERSION,
      });

      await redis.publish(channel, message);
      console.log(
        `[Survey Analytics Worker] Published analytics completion event`,
      );
    } catch (error) {
      console.error(
        "[Survey Analytics Worker] Failed to publish analytics event:",
        error,
      );
    }

    await job.updateProgress(100);

    return {
      surveyId,
      overallSummary,
      analyticsData,
      totalConversations: analyticsData.coreMetrics.totalConversations,
      widgetCount: analyticsData.dashboardWidgets.length,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60000,
    },
  },
);

surveyAnalyticsWorker.on("completed", (job) => {
  console.log(`[Survey Analytics Worker] Job ${job.id} completed`);
});

surveyAnalyticsWorker.on("failed", (job, err) => {
  console.error(
    `[Survey Analytics Worker] Job ${job?.id} failed:`,
    err.message,
  );
});

surveyAnalyticsWorker.on("error", (err) => {
  console.error("[Survey Analytics Worker] Worker error:", err);
});

// Note: Signal handlers are managed by the main index.ts when running all workers together
// Individual signal handlers removed to prevent conflicts

export default surveyAnalyticsWorker;
