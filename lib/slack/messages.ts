/**
 * Slack Message Formatting
 *
 * Utilities for formatting survey data as Slack messages
 */

import type { surveys, surveyAnalytics } from "@/db/schema";
import type { Block, KnownBlock } from "@slack/web-api";

/**
 * Format survey created message
 */
export function formatSurveyCreatedMessage(
  survey: typeof surveys.$inferSelect
) {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: `🎯 New Survey Created: ${survey.title}`,
        emoji: true,
      },
    },
    {
      type: "section" as const,
      fields: [
        {
          type: "mrkdwn" as const,
          text: `*Status:*\n${survey.status === "active" ? "✅ Active" : "⏸️ Inactive"}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Participant Limit:*\n${survey.participantLimit}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Language:*\n${survey.language.toUpperCase()}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Current Participants:*\n${survey.currentParticipants}`,
        },
      ],
    },
  ];

  if (survey.objective?.goal) {
    blocks.push({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `*Goal:*\n${survey.objective.goal}`,
      },
    });
  }

  if (survey.requiredQuestions && survey.requiredQuestions.length > 0) {
    blocks.push(
      {
        type: "divider" as const,
      },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `*Required Questions:*\n${survey.requiredQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
        },
      }
    );
  }

  return {
    text: `New Survey Created: ${survey.title}`,
    blocks,
  };
}

/**
 * Format new conversation message
 */
export function formatNewConversationMessage(data: {
  surveyTitle: string;
  conversationId: string;
  participantId: string;
  totalConversations: number;
}) {
  return {
    text: `New survey response received for ${data.surveyTitle}`,
    blocks: [
      {
        type: "header" as const,
        text: {
          type: "plain_text" as const,
          text: `💬 New Survey Response`,
          emoji: true,
        },
      },
      {
        type: "section" as const,
        fields: [
          {
            type: "mrkdwn" as const,
            text: `*Survey:*\n${data.surveyTitle}`,
          },
          {
            type: "mrkdwn" as const,
            text: `*Total Responses:*\n${data.totalConversations}`,
          },
        ],
      },
      {
        type: "context" as const,
        elements: [
          {
            type: "mrkdwn" as const,
            text: `Conversation ID: \`${data.conversationId}\``,
          },
        ],
      },
    ],
  };
}

/**
 * Format analytics update message
 */
export function formatAnalyticsUpdateMessage(data: {
  surveyTitle: string;
  analytics: typeof surveyAnalytics.$inferSelect;
}) {
  const { analytics } = data;

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: `📊 Survey Analytics Updated: ${data.surveyTitle}`,
        emoji: true,
      },
    },
    {
      type: "section" as const,
      fields: [
        {
          type: "mrkdwn" as const,
          text: `*Total Conversations:*\n${analytics.totalConversations}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Avg. Length:*\n${analytics.averageConversationLength?.toFixed(1) || "N/A"} messages`,
        },
      ],
    },
  ];

  if (analytics.overallSummary) {
    blocks.push({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `*Summary:*\n${analytics.overallSummary.slice(0, 500)}${analytics.overallSummary.length > 500 ? "..." : ""}`,
      },
    });
  }

  // Add top insights from metrics if available
  if (
    analytics.metrics &&
    typeof analytics.metrics === "object" &&
    "insights" in analytics.metrics
  ) {
    const insights = analytics.metrics.insights;
    if (Array.isArray(insights) && insights.length > 0) {
      const topInsights = insights.slice(0, 3);
      blocks.push(
        {
          type: "divider" as const,
        },
        {
          type: "section" as const,
          text: {
            type: "mrkdwn" as const,
            text: `*Top Insights:*\n${topInsights.map((insight: unknown, i: number) => `${i + 1}. ${String(insight)}`).join("\n")}`,
          },
        }
      );
    }
  }

  // Add metrics if available
  if (analytics.metrics) {
    const metricsText = Object.entries(analytics.metrics)
      .slice(0, 5)
      .map(([key, value]) => `• *${key}:* ${value}`)
      .join("\n");

    if (metricsText) {
      blocks.push({
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `*Key Metrics:*\n${metricsText}`,
        },
      });
    }
  }

  blocks.push({
    type: "context" as const,
    elements: [
      {
        type: "mrkdwn" as const,
        text: `Last updated: <!date^${Math.floor(analytics.updatedAt.getTime() / 1000)}^{date_short_pretty} at {time}|${analytics.updatedAt.toLocaleString()}>`,
      },
    ],
  });

  return {
    text: `Analytics updated for ${data.surveyTitle}`,
    blocks,
  };
}

/**
 * Format manual post message
 */
export function formatManualPostMessage(data: {
  title: string;
  content: string;
  fields?: Array<{ name: string; value: string }>;
}) {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: data.title,
        emoji: true,
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: data.content,
      },
    },
  ];

  if (data.fields && data.fields.length > 0) {
    blocks.push({
      type: "section" as const,
      fields: data.fields.map((field) => ({
        type: "mrkdwn" as const,
        text: `*${field.name}:*\n${field.value}`,
      })),
    });
  }

  return {
    text: data.title,
    blocks,
  };
}

/**
 * Format conversation digest message (batched conversations)
 */
export function formatConversationDigestMessage(data: {
  totalNewConversations: number;
  surveyBreakdown: Array<{
    surveyTitle: string;
    surveyId: string;
    count: number;
  }>;
  timeframe: string;
}) {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: `🎉 ${data.totalNewConversations} New Response${data.totalNewConversations === 1 ? "" : "s"} ${data.timeframe}`,
        emoji: true,
      },
    },
  ];

  // Add survey breakdown if multiple surveys
  if (data.surveyBreakdown.length > 1) {
    blocks.push({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `*Breakdown by Survey:*\n${data.surveyBreakdown
          .map((s) => `• *${s.surveyTitle}*: ${s.count} response${s.count === 1 ? "" : "s"}`)
          .join("\n")}`,
      },
    });
  } else if (data.surveyBreakdown.length === 1) {
    blocks.push({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `*Survey:* ${data.surveyBreakdown[0].surveyTitle}`,
      },
    });
  }

  return {
    text: `${data.totalNewConversations} new survey response${data.totalNewConversations === 1 ? "" : "s"} ${data.timeframe}`,
    blocks,
  };
}

