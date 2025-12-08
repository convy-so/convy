/**
 * Slack Message Formatting
 *
 * Utilities for formatting survey data as Slack messages
 */

import type { surveys, surveyAnalytics } from "@/db/schema";

/**
 * Format survey created message
 */
export function formatSurveyCreatedMessage(
  survey: typeof surveys.$inferSelect
) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🎯 New Survey Created: ${survey.title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Status:*\n${survey.status === "active" ? "✅ Active" : "⏸️ Inactive"}`,
        },
        {
          type: "mrkdwn",
          text: `*Participant Limit:*\n${survey.participantLimit}`,
        },
        {
          type: "mrkdwn",
          text: `*Language:*\n${survey.language.toUpperCase()}`,
        },
        {
          type: "mrkdwn",
          text: `*Current Participants:*\n${survey.currentParticipants}`,
        },
      ],
    },
  ];

  if (survey.objective?.goal) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Goal:*\n${survey.objective.goal}`,
      },
    });
  }

  if (survey.requiredQuestions && survey.requiredQuestions.length > 0) {
    blocks.push(
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
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
        type: "header",
        text: {
          type: "plain_text",
          text: `💬 New Survey Response`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Survey:*\n${data.surveyTitle}`,
          },
          {
            type: "mrkdwn",
            text: `*Total Responses:*\n${data.totalConversations}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
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

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 Survey Analytics Updated: ${data.surveyTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Total Conversations:*\n${analytics.totalConversations}`,
        },
        {
          type: "mrkdwn",
          text: `*Avg. Length:*\n${analytics.averageConversationLength?.toFixed(1) || "N/A"} messages`,
        },
      ],
    },
  ];

  if (analytics.overallSummary) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:*\n${analytics.overallSummary.slice(0, 500)}${analytics.overallSummary.length > 500 ? "..." : ""}`,
      },
    });
  }

  // Add top insights
  if (analytics.insights && analytics.insights.length > 0) {
    const topInsights = analytics.insights.slice(0, 3);
    blocks.push(
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top Insights:*\n${topInsights.map((insight, i) => `${i + 1}. ${insight}`).join("\n")}`,
        },
      }
    );
  }

  // Add metrics if available
  if (analytics.metrics) {
    const metricsText = Object.entries(analytics.metrics)
      .slice(0, 5)
      .map(([key, value]) => `• *${key}:* ${value}`)
      .join("\n");

    if (metricsText) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Key Metrics:*\n${metricsText}`,
        },
      });
    }
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
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
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: data.title,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: data.content,
      },
    },
  ];

  if (data.fields && data.fields.length > 0) {
    blocks.push({
      type: "section",
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
