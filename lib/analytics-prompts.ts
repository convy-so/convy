import "server-only";

/**
 * Analytics Prompts Module
 *
 * Production-ready prompts for extracting structured analytics from conversations.
 * Designed to work with the analytics.ts types and schemas.
 */

import type { SurveyConfig } from "./prompts";

// ============================================================================
// CONVERSATION-LEVEL INSIGHTS PROMPT
// ============================================================================

/**
 * Generate a structured insights extraction prompt for a single conversation
 */
export function getStructuredConversationInsightsPrompt(
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>,
  config: SurveyConfig
): string {
  const conversationText = conversation
    .map(
      (msg, i) =>
        `[${i + 1}] ${msg.role === "user" ? "PARTICIPANT" : "INTERVIEWER"}: ${msg.content}`
    )
    .join("\n\n");

  const requiredQuestionsSection =
    config.requiredQuestions.length > 0
      ? `Required Questions to Track:
${config.requiredQuestions.map((q, i) => `${i + 1}. "${q}"`).join("\n")}`
      : "No specific required questions defined.";

  const metricsSection =
    config.metrics.length > 0
      ? `Creator-Defined Metrics to Extract:
${config.metrics.map((m, i) => `${i + 1}. "${m}" - Extract specific value or categorization`).join("\n")}`
      : "No specific metrics defined by creator.";

  const hypothesesSection =
    config.hypotheses && config.hypotheses.assumptions.length > 0
      ? `Hypotheses to Evaluate (find evidence for/against):
${config.hypotheses.assumptions.map((h, i) => `${i + 1}. "${h}"`).join("\n")}`
      : "";

  const mediaSection =
    config.media && config.media.length > 0
      ? `Media Assets in This Survey (analyze how participant responded to each):
${config.media
  .map(
    (m, i) =>
      `${i + 1}. [${m.type.toUpperCase()}] ID: "${m.id}"${m.priority === "high" ? " (HIGH PRIORITY)" : ""}
   - Description: ${m.description}
   - Content Summary: ${m.contentSummary || "Not specified"}
   - Context for use: ${m.contextForUse}
   - Suggested questions: ${m.infoToGather || "Not specified"}
   - Required questions: ${m.requiredQuestions?.join("; ") || "None"}
   - Expected insight types: ${m.expectedInsights?.join(", ") || "Any"}`
  )
  .join("\n")}`
      : "";

  return `You are an expert survey analyst. Analyze this conversation and extract structured insights.

SURVEY CONTEXT:
- Goal: ${config.objective?.goal || "Gather participant feedback"}
- Target Audience: ${config.targetAudience?.description || "General participants"}
- Success Criteria: ${config.successCriteria?.description || "Quality insights"}
- Insight Types Needed: ${config.successCriteria?.insightTypes?.join(", ") || "Any"}

${requiredQuestionsSection}

${metricsSection}

${hypothesesSection}

${mediaSection}

CONVERSATION:
${conversationText}

Analyze this conversation and return a JSON object with the following structure. Be thorough and specific.

{
  "summary": "2-3 sentence summary of what was learned from this participant",
  
  "keyFindings": [
    "Finding 1 - specific insight with context",
    "Finding 2 - another key takeaway",
    "..."
  ],
  
  "engagementLevel": "high" | "medium" | "low",
  "responseQuality": 1-10,
  
  "topicsCovered": ["topic1", "topic2"],
  "requiredQuestionsCovered": ["exact question text that was adequately answered"],
  "requiredQuestionsMissed": ["exact question text that was NOT answered or poorly answered"],
  
  "sentiment": {
    "overall": "positive" | "negative" | "neutral" | "mixed",
    "score": -1.0 to 1.0,
    "confidence": 0.0 to 1.0
  },
  
  "extractedMetrics": {
    "metric_name": "extracted value or category"
  },
  
  "notableQuotes": [
    {
      "text": "Exact quote from participant",
      "context": "Why this quote is notable",
      "sentiment": "positive" | "negative" | "neutral"
    }
  ],
  
  "hypothesisEvidence": [
    {
      "hypothesis": "The original hypothesis text",
      "evidence": "supporting" | "contradicting" | "neutral",
      "quote": "Relevant quote if any"
    }
  ],
  
  "insightTypes": {
    "emotional": {
      "found": true | false,
      "examples": ["feeling or emotion expressed"]
    },
    "behavioral": {
      "found": true | false,
      "examples": ["action or behavior mentioned"]
    },
    "rational": {
      "found": true | false,
      "examples": ["reasoning or logic expressed"]
    }
  },
  
  "unexpectedFindings": [
    "Anything interesting that wasn't specifically asked about"
  ],
  
  "mediaInteractions": [
    {
      "mediaId": "The media ID from the list above",
      "mediaType": "image" | "audio" | "video",
      "description": "Brief description of the media",
      "wasReferenced": true | false,
      "participantEngaged": true | false,
      "participantReaction": "positive" | "negative" | "neutral" | "confused" | "not_shown",
      "clarityScore": 1-10,
      "insightQuality": "high" | "medium" | "low" | "none",
      "responsesAboutMedia": ["Quote 1 specifically about this media", "Quote 2"],
      "insightsGenerated": ["Insight derived from discussing this media"],
      "issuesIdentified": ["Any confusion or problems with this media"]
    }
  ]
}

IMPORTANT:
- For mediaInteractions, analyze EACH media asset listed above:
  - wasReferenced: Did the interviewer mention or reference this media?
  - participantEngaged: Did the participant respond specifically about the media?
  - participantReaction: How did they react? Use "not_shown" if media wasn't referenced
  - clarityScore: 1-10 rating of how well the media helped convey information (1=confusing, 10=very clear)
  - responsesAboutMedia: Extract exact quotes where participant discusses the media
  - insightsGenerated: What did we learn specifically because of this media?
  - issuesIdentified: Any confusion, technical problems, or negative feedback about the media
- For requiredQuestionsCovered/Missed, use the EXACT question text from the list above
- For extractedMetrics, use the exact metric names defined above as keys
- For notableQuotes, select the 3-5 most insightful quotes from the participant
- Be specific and use actual content from the conversation
- If a metric cannot be determined, use "not_determined" as the value

Return ONLY the JSON object, no additional text.`;
}

// ============================================================================
// SURVEY-LEVEL ANALYTICS PROMPT
// ============================================================================

/**
 * Generate prompt for aggregating all conversation insights into survey analytics
 */
export function getSurveyAnalyticsPrompt(
  conversationInsights: Array<{
    id: string;
    summary: string;
    keyFindings: string[];
    sentiment: { overall: string; score: number };
    extractedMetrics: Record<string, string | number | boolean>;
    notableQuotes: Array<{
      text: string;
      context?: string;
      sentiment?: string;
    }>;
    hypothesisEvidence: Array<{
      hypothesis: string;
      evidence: string;
      quote?: string;
    }>;
    engagementLevel: string;
    topicsCovered: string[];
    mediaInteractions?: Array<{
      mediaId: string;
      mediaType: string;
      wasReferenced: boolean;
      participantEngaged: boolean;
      participantReaction: string;
      clarityScore: number;
      insightQuality: string;
      responsesAboutMedia: string[];
      issuesIdentified: string[];
    }>;
  }>,
  config: SurveyConfig,
  totalConversations: number
): string {
  const insightsText = conversationInsights
    .map(
      (insight, i) => `
--- Conversation ${i + 1} (${insight.id}) ---
Summary: ${insight.summary}
Key Findings: ${insight.keyFindings.join("; ")}
Sentiment: ${insight.sentiment.overall} (score: ${insight.sentiment.score})
Engagement: ${insight.engagementLevel}
Topics: ${insight.topicsCovered.join(", ")}
Metrics: ${JSON.stringify(insight.extractedMetrics)}
Notable Quotes: ${insight.notableQuotes.map((q) => `"${q.text}"`).join("; ")}
Hypothesis Evidence: ${insight.hypothesisEvidence.map((h) => `${h.hypothesis}: ${h.evidence}`).join("; ") || "None"}
Media Interactions: ${
        insight.mediaInteractions
          ?.map(
            (m) =>
              `${m.mediaType}[${m.mediaId}]: ${m.wasReferenced ? "shown" : "not shown"}, reaction: ${m.participantReaction}, clarity: ${m.clarityScore}/10, insights: ${m.insightQuality}${m.issuesIdentified.length > 0 ? `, issues: ${m.issuesIdentified.join("; ")}` : ""}`
          )
          .join("; ") || "No media"
      }
`
    )
    .join("\n");

  const metricsToAggregate =
    config.metrics.length > 0
      ? `Metrics Defined by Survey Creator (MUST aggregate these):
${config.metrics.map((m, i) => `${i + 1}. "${m}"`).join("\n")}`
      : "";

  const hypothesesToValidate =
    config.hypotheses && config.hypotheses.assumptions.length > 0
      ? `Hypotheses to Validate:
${config.hypotheses.assumptions.map((h, i) => `${i + 1}. "${h}"`).join("\n")}`
      : "";

  const mediaToAnalyze =
    config.media && config.media.length > 0
      ? `Media Assets to Analyze for Effectiveness:
${config.media
  .map(
    (m, i) => `${i + 1}. [${m.type.toUpperCase()}] "${m.id}": ${m.description}`
  )
  .join("\n")}`
      : "";

  return `You are a senior survey analytics expert. Aggregate these ${totalConversations} conversation insights into comprehensive survey analytics.

SURVEY CONTEXT:
- Title: ${config.information}
- Goal: ${config.objective?.goal || "Gather participant feedback"}
- Target Audience: ${config.targetAudience?.description || "General participants"}
- Success Criteria: ${config.successCriteria?.description || "Quality insights"}
- Expected Insight Types: ${config.successCriteria?.insightTypes?.join(", ") || "All types"}

Required Questions: ${config.requiredQuestions.length > 0 ? config.requiredQuestions.join("; ") : "None specified"}

${metricsToAggregate}

${hypothesesToValidate}

${mediaToAnalyze}

INDIVIDUAL CONVERSATION INSIGHTS:
${insightsText}

Generate comprehensive analytics in this exact JSON structure:

{
  "executiveSummary": {
    "headline": "One powerful sentence summarizing the most important finding",
    "keyInsights": [
      "Top insight 1 - actionable and specific",
      "Top insight 2",
      "Top insight 3",
      "Top insight 4",
      "Top insight 5"
    ],
    "overallSentiment": {
      "overall": "positive" | "negative" | "neutral" | "mixed",
      "score": -1.0 to 1.0,
      "confidence": 0.0 to 1.0
    },
    "recommendedActions": [
      "Specific action to take based on findings",
      "Another recommended action"
    ]
  },
  
  "creatorMetrics": [
    {
      "name": "Metric name from creator's list",
      "type": "categorical" | "numeric" | "sentiment" | "boolean" | "text",
      "description": "What this metric measures",
      "values": [
        {
          "value": "Value or category",
          "count": 5,
          "percentage": 50.0,
          "examples": [
            {
              "text": "Quote example",
              "conversationId": "conv_id"
            }
          ]
        }
      ],
      "summary": "One sentence summary of this metric's findings",
      "chartType": "pie" | "bar" | "histogram" | "wordcloud" | "text",
      "chartData": [
        { "label": "Category", "value": 5, "color": "#hexcolor" }
      ]
    }
  ],
  
  "hypothesisValidations": [
    {
      "hypothesis": "Original hypothesis text",
      "status": "validated" | "refuted" | "mixed" | "insufficient_data",
      "confidence": 0-100,
      "supportingCount": 3,
      "contradictingCount": 1,
      "supportingEvidence": [
        { "quote": "Supporting quote", "conversationId": "id", "type": "supporting" }
      ],
      "contradictingEvidence": [
        { "quote": "Contradicting quote", "conversationId": "id", "type": "contradicting" }
      ],
      "summary": "Brief summary of what the data shows",
      "recommendation": "What to do with this finding"
    }
  ],
  
  "discoveredInsights": {
    "trends": [
      {
        "id": "trend_1",
        "type": "trend" | "pattern" | "correlation",
        "title": "Short title",
        "description": "Detailed description of the pattern",
        "frequency": 8,
        "frequencyPercentage": 80.0,
        "significance": "high" | "medium" | "low",
        "sentiment": "positive" | "negative" | "neutral",
        "supportingQuotes": [
          { "text": "Quote", "conversationId": "id", "sentiment": "positive" }
        ],
        "relatedTopics": ["topic1", "topic2"]
      }
    ],
    
    "outliers": [
      {
        "id": "outlier_1",
        "conversationId": "id of unusual conversation",
        "description": "What makes this response unusual",
        "whyNotable": "Why this matters",
        "quote": "The unusual quote",
        "significance": "high" | "medium" | "low"
      }
    ],
    
    "recommendations": [
      {
        "id": "rec_1",
        "type": "action" | "follow_up_survey" | "product_change" | "process_improvement",
        "title": "Short action title",
        "description": "Detailed recommendation",
        "priority": "high" | "medium" | "low",
        "basedOn": "What data supports this recommendation",
        "expectedImpact": "What impact this could have"
      }
    ],
    
    "emergentTopics": [
      {
        "topic": "Topic name",
        "mentionCount": 5,
        "mentionPercentage": 50.0,
        "sentiment": "positive" | "negative" | "neutral" | "mixed",
        "isUnexpected": true,
        "relatedQuotes": [
          { "text": "Quote mentioning topic", "conversationId": "id" }
        ],
        "suggestion": "Consider adding this to future surveys"
      }
    ],
    
    "surprisingFindings": [
      "Something unexpected that emerged from the data"
    ],
    
    "dataGaps": [
      "Information that couldn't be determined from conversations"
    ]
  },
  
  "goalAssessment": {
    "surveyObjective": "${config.objective?.goal || "Gather feedback"}",
    "achievementScore": 1-10,
    "achievementLevel": "exceeded" | "met" | "partially_met" | "not_met",
    "insightTypesCollected": {
      "emotional": {
        "collected": true | false,
        "count": 5,
        "quality": "high" | "medium" | "low",
        "examples": ["Example emotional insight"]
      },
      "behavioral": {
        "collected": true | false,
        "count": 3,
        "quality": "high" | "medium" | "low",
        "examples": ["Example behavioral insight"]
      },
      "rational": {
        "collected": true | false,
        "count": 4,
        "quality": "high" | "medium" | "low",
        "examples": ["Example rational insight"]
      }
    },
    "successfulAspects": [
      "What worked well in this survey"
    ],
    "gapsIdentified": [
      "What could have been better"
    ],
    "recommendedNextSteps": [
      "Suggested follow-up action"
    ],
    "suggestedFollowUpQuestions": [
      "Question to ask in a follow-up survey"
    ]
  },
  
  "requiredQuestionsCompletion": [
    {
      "question": "The required question text",
      "coverageRate": 0-100,
      "qualityScore": 1-10,
      "sampleResponses": ["Response 1", "Response 2", "Response 3"]
    }
  ],
  
  "mediaAnalytics": {
    "totalMediaAssets": 3,
    "mediaByType": {
      "images": 1,
      "audio": 1,
      "video": 1
    },
    "overallUsageRate": 0-100,
    "mediaWithHighEngagement": 2,
    "mediaWithIssues": 1,
    "mediaEffectiveness": [
      {
        "mediaId": "id from media list",
        "mediaType": "image" | "audio" | "video",
        "description": "Brief description",
        "usageRate": 0-100,
        "participantEngagementRate": 0-100,
        "averageClarityScore": 1-10,
        "reactionBreakdown": {
          "positive": 3,
          "negative": 1,
          "neutral": 2,
          "confused": 1
        },
        "insightsGeneratedCount": 5,
        "highValueInsightsCount": 2,
        "topQuotes": [
          { "text": "Quote about this media", "conversationId": "id" }
        ],
        "commonIssues": ["Any issues with this media"],
        "issueFrequency": 0-100,
        "effectivenessScore": 1-10,
        "effectivenessLevel": "excellent" | "good" | "moderate" | "poor" | "unused",
        "recommendation": "What to do with this media"
      }
    ],
    "mediaInsights": {
      "mostEffectiveMedia": "mediaId or null",
      "leastEffectiveMedia": "mediaId or null",
      "topMediaInsight": "What the best media revealed",
      "mediaImpactSummary": "Overall impact of media on survey quality"
    },
    "mediaRecommendations": [
      {
        "type": "remove" | "improve" | "add" | "keep",
        "mediaId": "id if applicable",
        "description": "What to do",
        "reason": "Why this recommendation",
        "priority": "high" | "medium" | "low"
      }
    ]
  }
}

CRITICAL INSTRUCTIONS:
1. For creatorMetrics: Create one entry for EACH metric the survey creator defined. Aggregate values across all conversations.
2. For hypothesisValidations: Create one entry for EACH hypothesis. Include all evidence from conversations.
3. For trends: Look for patterns across multiple conversations (things appearing in 3+ conversations).
4. For outliers: Identify 1-3 responses that stand out as unusual or particularly insightful.
5. For recommendations: Provide 3-5 actionable recommendations based on the data.
6. For emergentTopics: Identify topics that participants brought up that WEREN'T explicitly asked about.
7. Use actual quotes and conversation IDs from the data.
8. Assign appropriate chart types based on the data (pie for categories, bar for comparisons, etc.)
9. Color suggestions: Use positive colors (#22c55e green) for positive values, (#ef4444 red) for negative, (#3b82f6 blue) for neutral.
10. For mediaAnalytics: ONLY include if the survey has media assets. Analyze each media's effectiveness based on:
    - How often it was shown vs available
    - How participants reacted to it
    - What insights it generated
    - Any issues or confusion it caused
    - Provide specific recommendations for each underperforming media

Return ONLY the JSON object, no additional text.`;
}

// ============================================================================
// AI DISCOVERY PROMPT (Supplementary)
// ============================================================================

/**
 * Generate prompt specifically for AI to discover insights not asked for
 */
export function getAIDiscoveryPrompt(
  allQuotes: Array<{ text: string; conversationId: string }>,
  allTopics: string[],
  config: SurveyConfig
): string {
  const quotesText = allQuotes
    .slice(0, 50)
    .map((q, i) => `[${q.conversationId}] "${q.text}"`)
    .join("\n");

  return `You are a pattern-recognition AI analyst. Your job is to find insights that the survey creator DIDN'T think to ask about.

SURVEY CONTEXT:
- Goal: ${config.objective?.goal || "Gather feedback"}
- Topics asked about: ${allTopics.slice(0, 20).join(", ")}
- Metrics tracked: ${config.metrics.join(", ") || "None specified"}

PARTICIPANT QUOTES (sample):
${quotesText}

Find patterns, correlations, and insights that WERE NOT part of the survey goals. Look for:
1. Unexpected topics participants brought up on their own
2. Emotional undercurrents not directly asked about
3. Connections between topics that weren't anticipated
4. Potential issues or opportunities the survey creator might have missed
5. Demographic or behavioral patterns that emerged naturally

Return a JSON array of discoveries:

[
  {
    "discovery": "What you found",
    "evidence": "Quote or pattern that supports this",
    "significance": "high" | "medium" | "low",
    "implication": "What this means for the survey creator",
    "suggestedAction": "What to do with this insight"
  }
]

Return ONLY the JSON array.`;
}

// ============================================================================
// CONVERSATION SUMMARY PROMPT (Improved)
// ============================================================================

/**
 * Generate improved conversation summary prompt
 */
export function getImprovedConversationSummaryPrompt(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig
): string {
  const conversationText = conversation
    .map(
      (msg) =>
        `${msg.role === "user" ? "Participant" : "Interviewer"}: ${msg.content}`
    )
    .join("\n\n");

  return `Summarize this survey conversation for analytics purposes.

Survey Goal: ${config.objective?.goal || "Gather feedback"}
Target Audience: ${config.targetAudience?.description || "Participants"}

Conversation:
${conversationText}

Write a 2-3 sentence summary that:
1. States the main point/finding from this participant
2. Notes their overall attitude/sentiment
3. Mentions any unique insights or notable quotes

Be specific and factual. Use the participant's own words where impactful.`;
}

// ============================================================================
// EXPORT TYPES FOR WORKER USE
// ============================================================================

export interface ConversationInsightsAIResponse {
  summary: string;
  keyFindings: string[];
  engagementLevel: "high" | "medium" | "low";
  responseQuality: number;
  topicsCovered: string[];
  requiredQuestionsCovered: string[];
  requiredQuestionsMissed: string[];
  sentiment: {
    overall: "positive" | "negative" | "neutral" | "mixed";
    score: number;
    confidence: number;
  };
  extractedMetrics: Record<string, string | number | boolean>;
  notableQuotes: Array<{
    text: string;
    context?: string;
    sentiment?: "positive" | "negative" | "neutral";
  }>;
  hypothesisEvidence: Array<{
    hypothesis: string;
    evidence: "supporting" | "contradicting" | "neutral";
    quote?: string;
  }>;
  insightTypes: {
    emotional: { found: boolean; examples: string[] };
    behavioral: { found: boolean; examples: string[] };
    rational: { found: boolean; examples: string[] };
  };
  unexpectedFindings: string[];
  mediaInteractions?: Array<{
    mediaId: string;
    mediaType: "image" | "audio" | "video";
    description: string;
    wasReferenced: boolean;
    participantEngaged: boolean;
    participantReaction:
      | "positive"
      | "negative"
      | "neutral"
      | "confused"
      | "not_shown";
    clarityScore: number;
    insightQuality: "high" | "medium" | "low" | "none";
    responsesAboutMedia: string[];
    insightsGenerated: string[];
    issuesIdentified: string[];
  }>;
}

export interface SurveyAnalyticsAIResponse {
  executiveSummary: {
    headline: string;
    keyInsights: string[];
    overallSentiment: {
      overall: "positive" | "negative" | "neutral" | "mixed";
      score: number;
      confidence: number;
    };
    recommendedActions: string[];
  };
  creatorMetrics: Array<{
    name: string;
    type: string;
    description?: string;
    values: Array<{
      value: string | number | boolean;
      count: number;
      percentage: number;
      examples: Array<{ text: string; conversationId: string }>;
    }>;
    summary: string;
    chartType: string;
    chartData: Array<{ label: string; value: number; color?: string }>;
  }>;
  hypothesisValidations: Array<{
    hypothesis: string;
    status: string;
    confidence: number;
    supportingCount: number;
    contradictingCount: number;
    supportingEvidence: Array<{
      quote: string;
      conversationId: string;
      type: string;
    }>;
    contradictingEvidence: Array<{
      quote: string;
      conversationId: string;
      type: string;
    }>;
    summary: string;
    recommendation: string;
  }>;
  discoveredInsights: {
    trends: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      frequency: number;
      frequencyPercentage: number;
      significance: string;
      sentiment?: string;
      supportingQuotes: Array<{
        text: string;
        conversationId: string;
        sentiment?: string;
      }>;
      relatedTopics: string[];
    }>;
    outliers: Array<{
      id: string;
      conversationId: string;
      description: string;
      whyNotable: string;
      quote: string;
      significance: string;
    }>;
    recommendations: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      priority: string;
      basedOn: string;
      expectedImpact?: string;
    }>;
    emergentTopics: Array<{
      topic: string;
      mentionCount: number;
      mentionPercentage: number;
      sentiment: string;
      isUnexpected: boolean;
      relatedQuotes: Array<{ text: string; conversationId: string }>;
      suggestion: string;
    }>;
    surprisingFindings: string[];
    dataGaps: string[];
  };
  goalAssessment: {
    surveyObjective: string;
    achievementScore: number;
    achievementLevel: string;
    insightTypesCollected: {
      emotional: {
        collected: boolean;
        count: number;
        quality: string;
        examples: string[];
      };
      behavioral: {
        collected: boolean;
        count: number;
        quality: string;
        examples: string[];
      };
      rational: {
        collected: boolean;
        count: number;
        quality: string;
        examples: string[];
      };
    };
    successfulAspects: string[];
    gapsIdentified: string[];
    recommendedNextSteps: string[];
    suggestedFollowUpQuestions: string[];
  };
  requiredQuestionsCompletion: Array<{
    question: string;
    coverageRate: number;
    qualityScore: number;
    sampleResponses: string[];
  }>;
  mediaAnalytics?: {
    totalMediaAssets: number;
    mediaByType: {
      images: number;
      audio: number;
      video: number;
    };
    overallUsageRate: number;
    mediaWithHighEngagement: number;
    mediaWithIssues: number;
    mediaEffectiveness: Array<{
      mediaId: string;
      mediaType: string;
      description: string;
      usageRate: number;
      participantEngagementRate: number;
      averageClarityScore: number;
      reactionBreakdown: {
        positive: number;
        negative: number;
        neutral: number;
        confused: number;
      };
      insightsGeneratedCount: number;
      highValueInsightsCount: number;
      topQuotes: Array<{ text: string; conversationId: string }>;
      commonIssues: string[];
      issueFrequency: number;
      effectivenessScore: number;
      effectivenessLevel: string;
      recommendation: string;
    }>;
    mediaInsights: {
      mostEffectiveMedia: string | null;
      leastEffectiveMedia: string | null;
      topMediaInsight: string;
      mediaImpactSummary: string;
    };
    mediaRecommendations: Array<{
      type: string;
      mediaId?: string;
      description: string;
      reason: string;
      priority: string;
    }>;
  };
}
