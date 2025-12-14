# Analytics Output Examples

This document demonstrates what the analytics output would look like for the example surveys in `survey-examples-analysis.md`.

---

## Example 1: Customer Product Feedback Survey (Churn Analysis)

Based on the conversation where a customer explained they cancelled due to price increase and finding a competitor (Asana).

### Executive Summary

```json
{
  "headline": "Price increase drove churn, but product-market fit for freelancers was the underlying issue",
  "keyInsights": [
    "Price sensitivity was triggered by pre-existing value concerns",
    "Solo freelancers feel enterprise features aren't worth the cost",
    "Asana's free tier met actual needs, suggesting feature bloat in our offering",
    "Core functionality is valued - a simpler tier could retain customers",
    "Recognition of customer value preceded the pricing decision"
  ],
  "overallSentiment": {
    "overall": "mixed",
    "score": -0.3,
    "confidence": 0.85
  },
  "recommendedActions": [
    "Create a freelancer/solo tier with reduced feature set and lower price",
    "Conduct feature usage analysis to identify underused enterprise features",
    "Survey churned freelancer customers to size this segment"
  ]
}
```

### Creator-Defined Metrics

Assuming the creator defined these metrics: "Churn reason", "Competitor mentioned", "Would return if..."

```json
{
  "creatorMetrics": [
    {
      "name": "Churn Reason",
      "type": "categorical",
      "values": [
        {
          "value": "Price too high",
          "count": 1,
          "percentage": 100,
          "examples": [{ "text": "The price increase was just too much" }]
        }
      ],
      "summary": "Primary churn driver was price sensitivity, triggered by 20% increase",
      "chartType": "pie",
      "chartData": [
        { "label": "Price too high", "value": 1, "color": "#ef4444" }
      ]
    },
    {
      "name": "Competitor Mentioned",
      "type": "categorical",
      "values": [
        {
          "value": "Asana",
          "count": 1,
          "percentage": 100,
          "examples": [
            {
              "text": "I tried Asana's free tier and it does everything I need"
            }
          ]
        }
      ],
      "summary": "Asana's free tier was the alternative chosen",
      "chartType": "bar",
      "chartData": [{ "label": "Asana", "value": 1, "color": "#3b82f6" }]
    },
    {
      "name": "Would Return If",
      "type": "text",
      "values": [
        {
          "value": "Simpler, cheaper freelancer plan",
          "count": 1,
          "percentage": 100,
          "examples": [
            {
              "text": "If they had a simpler, cheaper option for people like me, I probably would have stayed"
            }
          ]
        }
      ],
      "summary": "Willingness to return exists if pricing/feature alignment improves",
      "chartType": "text",
      "chartData": []
    }
  ]
}
```

### Hypothesis Validations

Assuming creator hypotheses: "Price increase caused churn" and "Competitors are winning on features"

```json
{
  "hypothesisValidations": [
    {
      "hypothesis": "Price increase caused churn",
      "status": "validated",
      "confidence": 90,
      "supportingCount": 1,
      "contradictingCount": 0,
      "supportingEvidence": [
        {
          "quote": "I was already on the fence about whether I was getting enough value, and then the price went up 20%. That pushed me over.",
          "conversationId": "conv_1",
          "type": "supporting"
        }
      ],
      "contradictingEvidence": [],
      "summary": "Price increase was the final trigger, but underlying value concerns existed",
      "recommendation": "Price was a trigger, not root cause. Address value perception before adjusting pricing."
    },
    {
      "hypothesis": "Competitors are winning on features",
      "status": "refuted",
      "confidence": 75,
      "supportingCount": 0,
      "contradictingCount": 1,
      "supportingEvidence": [],
      "contradictingEvidence": [
        {
          "quote": "The core functionality is really good",
          "conversationId": "conv_1",
          "type": "contradicting"
        }
      ],
      "summary": "Customer praised core functionality. Competitor won on price/simplicity, not features.",
      "recommendation": "Reframe competitive positioning around appropriate feature sets for user segments"
    }
  ]
}
```

### AI-Discovered Insights

```json
{
  "discoveredInsights": {
    "trends": [
      {
        "id": "trend_1",
        "type": "pattern",
        "title": "Product-Market Fit Gap for Solo Users",
        "description": "User identified as solo freelancer paying for team features they'll never use. This suggests a segment mismatch rather than pure pricing issue.",
        "frequency": 1,
        "frequencyPercentage": 100,
        "significance": "high",
        "sentiment": "negative",
        "supportingQuotes": [
          {
            "text": "I'm a solo freelancer, and the software felt like it was built for big teams. I was paying for stuff I'd never need.",
            "conversationId": "conv_1",
            "sentiment": "negative"
          }
        ],
        "relatedTopics": ["pricing", "features", "user segments"]
      }
    ],
    "outliers": [],
    "recommendations": [
      {
        "id": "rec_1",
        "type": "product_change",
        "title": "Create Solo/Freelancer Tier",
        "description": "Develop a stripped-down product tier targeting solo users with just core features at a lower price point",
        "priority": "high",
        "basedOn": "Customer explicitly stated they would have stayed with a simpler, cheaper option",
        "expectedImpact": "Could reduce churn in freelancer segment by addressing root cause of perceived value mismatch"
      },
      {
        "id": "rec_2",
        "type": "follow_up_survey",
        "title": "Survey Churned Freelancers",
        "description": "Conduct targeted outreach to churned customers identified as freelancers/solo users to validate segment size",
        "priority": "medium",
        "basedOn": "Single conversation suggests pattern but more data needed",
        "expectedImpact": "Quantify the freelancer churn opportunity before building new tier"
      }
    ],
    "emergentTopics": [
      {
        "topic": "Feature bloat perception",
        "mentionCount": 1,
        "mentionPercentage": 100,
        "sentiment": "negative",
        "isUnexpected": true,
        "relatedQuotes": [
          {
            "text": "I was paying for stuff I'd never need",
            "conversationId": "conv_1"
          }
        ],
        "suggestion": "Add 'perceived feature value' to future churn surveys"
      }
    ],
    "surprisingFindings": [
      "Customer expressed disappointment about leaving despite churning - emotional attachment exists to the product"
    ],
    "dataGaps": [
      "Unable to determine customer lifetime value or time as customer",
      "No data on what percentage of churned customers are solo users"
    ]
  }
}
```

### Goal Assessment

```json
{
  "goalAssessment": {
    "surveyObjective": "Understand why customers canceled subscriptions",
    "achievementScore": 8,
    "achievementLevel": "met",
    "insightTypesCollected": {
      "emotional": {
        "collected": true,
        "count": 2,
        "quality": "high",
        "examples": [
          "A bit disappointed actually. I liked the product.",
          "Relieved I'm saving money now."
        ]
      },
      "behavioral": {
        "collected": true,
        "count": 2,
        "quality": "high",
        "examples": [
          "I tried Asana's free tier",
          "I was already on the fence before the price increase"
        ]
      },
      "rational": {
        "collected": true,
        "count": 2,
        "quality": "high",
        "examples": [
          "If they had a simpler, cheaper option for people like me, I probably would have stayed",
          "The cost-benefit no longer made sense"
        ]
      }
    },
    "successfulAspects": [
      "Uncovered root cause beyond surface-level price complaint",
      "Identified specific actionable insight (freelancer tier)",
      "Validated one hypothesis, refuted another with evidence",
      "Captured emotional state and willingness to return"
    ],
    "gapsIdentified": [
      "Could have explored how many other freelancers customer knows who churned",
      "Didn't ask about specific features that would be 'enough'"
    ],
    "recommendedNextSteps": [
      "Quantify freelancer segment in customer base",
      "Define minimum viable feature set for freelancer tier",
      "Price sensitivity analysis for different tiers"
    ],
    "suggestedFollowUpQuestions": [
      "What 3 features do you use most often?",
      "What price point would make you reconsider?",
      "Do you know others like you who also churned?"
    ]
  }
}
```

### Dashboard Widgets (Sample)

```json
{
  "dashboardWidgets": [
    {
      "id": "total_responses",
      "type": "stat_card",
      "title": "Total Responses",
      "priority": 0,
      "size": "small",
      "data": { "value": 1, "label": "conversations", "icon": "users" }
    },
    {
      "id": "completion_rate",
      "type": "stat_card",
      "title": "Completion Rate",
      "priority": 1,
      "size": "small",
      "data": {
        "value": "100%",
        "label": "completed",
        "trend": "up",
        "icon": "check-circle"
      }
    },
    {
      "id": "overall_sentiment",
      "type": "sentiment_gauge",
      "title": "Overall Sentiment",
      "priority": 2,
      "size": "medium",
      "data": { "overall": "mixed", "score": -0.3, "confidence": 0.85 }
    },
    {
      "id": "key_insights",
      "type": "insight_list",
      "title": "Key Insights",
      "priority": 3,
      "size": "large",
      "data": {
        "insights": [
          {
            "text": "Price sensitivity was triggered by pre-existing value concerns",
            "significance": "high"
          },
          {
            "text": "Solo freelancers feel enterprise features aren't worth the cost",
            "significance": "high"
          },
          {
            "text": "Core functionality is valued - a simpler tier could retain customers",
            "significance": "high"
          }
        ]
      }
    },
    {
      "id": "hypothesis_price_increase",
      "type": "hypothesis_card",
      "title": "Hypothesis Validation",
      "priority": 4,
      "size": "medium",
      "data": {
        "hypothesis": "Price increase caused churn",
        "status": "validated",
        "confidence": 90,
        "summary": "Confirmed - price was the trigger, but underlying value concerns existed"
      }
    },
    {
      "id": "notable_quotes",
      "type": "quote_carousel",
      "title": "Notable Participant Quotes",
      "priority": 5,
      "size": "large",
      "data": {
        "quotes": [
          {
            "text": "I was paying for stuff I'd never need",
            "conversationId": "conv_1",
            "sentiment": "negative"
          },
          {
            "text": "If they had a simpler, cheaper option for people like me, I probably would have stayed",
            "conversationId": "conv_1",
            "sentiment": "neutral"
          }
        ]
      }
    },
    {
      "id": "recommendations",
      "type": "recommendation_card",
      "title": "Recommended Actions",
      "priority": 6,
      "size": "full",
      "data": [
        {
          "type": "product_change",
          "title": "Create Solo/Freelancer Tier",
          "description": "Develop a stripped-down product tier targeting solo users",
          "priority": "high"
        }
      ]
    }
  ]
}
```

---

## Example 2: Employee Engagement Survey

Based on the conversation with the engineer who feels "lost" after the reorg.

### Executive Summary

```json
{
  "headline": "Career path uncertainty, not workload, is driving disengagement post-reorg",
  "keyInsights": [
    "Unclear career progression is the primary driver of disengagement",
    "New managers lack relationship context needed to advocate for employees",
    "Feeling 'lost' stems from broken career development relationship",
    "Employees have reduced discretionary effort due to uncertainty",
    "Recognition of ambitions matters as much as formal career paths"
  ],
  "overallSentiment": {
    "overall": "negative",
    "score": -0.5,
    "confidence": 0.9
  },
  "recommendedActions": [
    "Prioritize career conversations for all reorg-affected employees",
    "Create transition support for new manager-employee relationships",
    "Establish interim career advocacy process during manager transitions"
  ]
}
```

### Hypothesis Validation

```json
{
  "hypothesisValidations": [
    {
      "hypothesis": "Unclear career paths after reorg are causing disengagement",
      "status": "validated",
      "confidence": 95,
      "supportingCount": 1,
      "contradictingCount": 0,
      "supportingEvidence": [
        {
          "quote": "Before the reorg, I had a clear path to senior engineer. Now my old manager is gone, the new one doesn't really know me, and I have no idea what I need to do to level up.",
          "conversationId": "conv_2",
          "type": "supporting"
        },
        {
          "quote": "I'm definitely less motivated. I used to take on extra projects, but now I'm just doing my job.",
          "conversationId": "conv_2",
          "type": "supporting"
        }
      ],
      "contradictingEvidence": [],
      "summary": "Strongly validated - career uncertainty directly linked to reduced engagement",
      "recommendation": "Immediate intervention needed: Career conversations with reorg-affected engineers"
    }
  ]
}
```

### AI-Discovered Insights

```json
{
  "discoveredInsights": {
    "trends": [
      {
        "id": "trend_1",
        "type": "pattern",
        "title": "Relationship Gap with New Managers",
        "description": "The issue isn't just career paths on paper - it's the loss of a relationship with someone who knew the employee's work and could advocate for them",
        "frequency": 1,
        "frequencyPercentage": 100,
        "significance": "high",
        "supportingQuotes": [
          {
            "text": "He'd been here for years. He knew my work, advocated for me in promotion discussions. The new manager is nice but she's new to management entirely.",
            "conversationId": "conv_2"
          }
        ],
        "relatedTopics": ["manager relationships", "advocacy", "promotions"]
      }
    ],
    "emergentTopics": [
      {
        "topic": "Manager advocacy in promotions",
        "mentionCount": 1,
        "mentionPercentage": 100,
        "sentiment": "negative",
        "isUnexpected": true,
        "relatedQuotes": [
          {
            "text": "The relationship is just as important as the process",
            "conversationId": "conv_2"
          }
        ],
        "suggestion": "Explore manager advocacy training or interim advocacy processes"
      }
    ],
    "recommendations": [
      {
        "id": "rec_1",
        "type": "action",
        "title": "Manager Career Conversation Initiative",
        "description": "Have all new managers schedule 1:1 career conversations with reports within 30 days",
        "priority": "high",
        "basedOn": "Employee said 'even if she doesn't know yet, just acknowledging that I have ambitions would help'"
      },
      {
        "id": "rec_2",
        "type": "process_improvement",
        "title": "Manager Transition Handoff Protocol",
        "description": "Create formal handoff process where departing managers share performance context and career aspirations with incoming managers",
        "priority": "medium",
        "basedOn": "New manager lacks historical context about employee's contributions"
      }
    ]
  }
}
```

---

## API Response Structure

The `/api/surveys/[surveyId]/analytics` endpoint returns data in this structure:

### Full Response (format=full, default)

```typescript
{
  status: "ready" | "generating" | "not_generated",
  surveyId: string,
  surveyTitle: string,
  generatedAt: string,
  dataVersion: string,

  executiveSummary: ExecutiveSummary,
  coreMetrics: CoreMetrics,
  creatorMetrics: CreatorMetric[],
  hypothesisValidations: HypothesisValidation[],
  discoveredInsights: DiscoveredInsights,
  goalAssessment: GoalAssessment,
  dashboardWidgets: DashboardWidget[],

  conversationCount: number,
  lastUpdated: string
}
```

### Summary Response (format=summary)

```typescript
{
  status: "ready",
  surveyId: string,
  surveyTitle: string,
  lastUpdated: string,
  dataVersion: string,
  summary: {
    headline: string,
    keyInsights: string[],
    overallSentiment: SentimentAnalysis | null,
    totalConversations: number,
    completionRate: number,
    insightQualityScore: number,
    goalAchievementScore: number
  }
}
```

### Widgets Only Response (format=widgets)

```typescript
{
  status: "ready",
  surveyId: string,
  lastUpdated: string,
  widgets: DashboardWidget[]
}
```

---

## Media Analytics Example

For surveys that include media assets (images, videos, audio), the analytics includes detailed media effectiveness tracking.

### Example: Product Demo Video Feedback

Assuming the survey includes a 60-second product demo video to gather reactions.

```json
{
  "mediaAnalytics": {
    "totalMediaAssets": 2,
    "mediaByType": {
      "images": 1,
      "audio": 0,
      "video": 1
    },
    "overallUsageRate": 95,
    "mediaWithHighEngagement": 1,
    "mediaWithIssues": 1,
    "mediaEffectiveness": [
      {
        "mediaId": "product_demo_video",
        "mediaType": "video",
        "description": "60-second product demo showing new dashboard feature",
        "usageRate": 100,
        "participantEngagementRate": 85,
        "averageClarityScore": 8.2,
        "reactionBreakdown": {
          "positive": 12,
          "negative": 2,
          "neutral": 4,
          "confused": 2
        },
        "insightsGeneratedCount": 18,
        "highValueInsightsCount": 7,
        "topQuotes": [
          {
            "text": "The animation showing data flow really helped me understand how it works",
            "conversationId": "conv_123"
          },
          {
            "text": "I wish it showed more about customization options",
            "conversationId": "conv_456"
          }
        ],
        "commonIssues": ["Some participants wanted to pause/rewind"],
        "issueFrequency": 10,
        "effectivenessScore": 8,
        "effectivenessLevel": "excellent",
        "recommendation": "Highly effective - this video generated valuable insights about user understanding. Consider adding interactive pause points."
      },
      {
        "mediaId": "pricing_screenshot",
        "mediaType": "image",
        "description": "Screenshot of new pricing page layout",
        "usageRate": 90,
        "participantEngagementRate": 60,
        "averageClarityScore": 6.5,
        "reactionBreakdown": {
          "positive": 6,
          "negative": 5,
          "neutral": 7,
          "confused": 2
        },
        "insightsGeneratedCount": 8,
        "highValueInsightsCount": 2,
        "topQuotes": [
          {
            "text": "The comparison table is hard to read on mobile",
            "conversationId": "conv_789"
          }
        ],
        "commonIssues": ["Text too small", "Unclear tier differences"],
        "issueFrequency": 35,
        "effectivenessScore": 5,
        "effectivenessLevel": "moderate",
        "recommendation": "Moderate effectiveness. Consider improving image clarity or providing a larger version."
      }
    ],
    "mediaInsights": {
      "mostEffectiveMedia": "product_demo_video",
      "leastEffectiveMedia": "pricing_screenshot",
      "topMediaInsight": "Video generated 18 insights including specific feedback on dashboard animation clarity",
      "mediaImpactSummary": "1 of 2 media assets performed well. Overall usage rate: 95%. The video was highly effective while the screenshot needs improvement."
    },
    "mediaRecommendations": [
      {
        "type": "keep",
        "mediaId": "product_demo_video",
        "description": "Continue using product demo video",
        "reason": "High engagement and insight generation",
        "priority": "low"
      },
      {
        "type": "improve",
        "mediaId": "pricing_screenshot",
        "description": "Improve pricing page screenshot",
        "reason": "35% of users had issues with clarity - text too small, unclear tier differences",
        "priority": "high"
      }
    ]
  }
}
```

### Media Dashboard Widgets

Media analytics automatically generates these widget types:

| Widget ID               | Type                  | Description                                    |
| ----------------------- | --------------------- | ---------------------------------------------- |
| `media_overview`        | `stat_card`           | Total media count by type                      |
| `media_usage_rate`      | `stat_card`           | Overall usage percentage                       |
| `media_effectiveness`   | `media_effectiveness` | Detailed breakdown of each media's performance |
| `top_media`             | `media_card`          | Highlights best performing media               |
| `media_issues`          | `insight_list`        | Alerts for media with problems                 |
| `media_recommendations` | `recommendation_card` | Suggestions for improving media usage          |

---

## Widget Types Reference

| Type                  | Description                 | Data Shape                                                    |
| --------------------- | --------------------------- | ------------------------------------------------------------- |
| `stat_card`           | Single value with label     | `{ value, label, trend?, icon? }`                             |
| `pie_chart`           | Category distribution       | `{ segments: [{label, value, color}] }`                       |
| `bar_chart`           | Comparison bars             | `{ bars: [{label, value, color}], xAxisLabel?, yAxisLabel? }` |
| `sentiment_gauge`     | Sentiment visualization     | `{ overall, score, confidence }`                              |
| `insight_list`        | List of text insights       | `{ insights: [{text, significance}] }`                        |
| `quote_carousel`      | Scrollable quotes           | `{ quotes: [{text, conversationId, sentiment?}] }`            |
| `hypothesis_card`     | Hypothesis validation       | Full HypothesisValidation object                              |
| `recommendation_card` | Action recommendations      | Recommendation[]                                              |
| `coverage_matrix`     | Required questions coverage | RequiredQuestionCoverage[]                                    |
| `metric_breakdown`    | Detailed metric view        | CreatorMetric object                                          |
| `media_effectiveness` | Media performance table     | MediaEffectivenessMetrics[]                                   |
| `media_card`          | Single media highlight      | `{ mediaId, type, effectivenessScore, topQuotes }`            |

---

## Notes for Frontend Implementation

1. **Widget Priority**: Lower priority number = more important, show first
2. **Widget Size**: `small` (1 col), `medium` (2 col), `large` (3 col), `full` (full width)
3. **Colors**: Use semantic colors provided in chartData, or defaults:
   - Positive: `#22c55e` (green)
   - Negative: `#ef4444` (red)
   - Neutral: `#3b82f6` (blue)
   - Warning: `#eab308` (yellow)
4. **Sentiment Score**: -1 (very negative) to +1 (very positive)
5. **Confidence**: 0-1 for sentiment, 0-100 for hypotheses
