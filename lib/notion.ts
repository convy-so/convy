import { Client } from "@notionhq/client";
import { env } from "./env";

/**
 * Initialize the Notion client
 * This client is used to interact with the Notion API
 */
export function getNotionClient(apiKey?: string) {
  const key = apiKey || env.NOTION_API_KEY;

  if (!key) {
    throw new Error(
      "Notion API key is required. Please provide it in the environment variables or as a parameter."
    );
  }

  return new Client({
    auth: key,
  });
}

/**
 * Check if user has Notion integration configured
 */
export function hasNotionIntegration(userNotionToken?: string): boolean {
  return !!(userNotionToken || env.NOTION_API_KEY);
}

/**
 * Format survey data for Notion database
 */
export function formatSurveyForNotion(survey: {
  id: string;
  title: string;
  status: string;
  objective?: Record<string, unknown> | null;
  targetAudience?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    Name: {
      title: [
        {
          text: {
            content: survey.title,
          },
        },
      ],
    },
    Status: {
      select: {
        name: survey.status,
      },
    },
    "Survey ID": {
      rich_text: [
        {
          text: {
            content: survey.id,
          },
        },
      ],
    },
    "Created At": {
      date: {
        start: survey.createdAt.toISOString(),
      },
    },
    "Updated At": {
      date: {
        start: survey.updatedAt.toISOString(),
      },
    },
  };
}

/**
 * Format analytics data for Notion page
 */
export function formatAnalyticsForNotion(analytics: {
  overallSummary: string;
  totalConversations: number;
  averageConversationLength: number;
  metrics: Record<string, unknown>;
}) {
  const blocks = [
    {
      object: "block" as const,
      type: "heading_1" as const,
      heading_1: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Survey Analytics",
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "heading_2" as const,
      heading_2: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Overall Summary",
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: analytics.overallSummary,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "heading_2" as const,
      heading_2: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Key Metrics",
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "bulleted_list_item" as const,
      bulleted_list_item: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `Total Conversations: ${analytics.totalConversations}`,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "bulleted_list_item" as const,
      bulleted_list_item: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `Average Conversation Length: ${analytics.averageConversationLength} messages`,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "heading_2" as const,
      heading_2: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Additional Metrics",
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "code" as const,
      code: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: JSON.stringify(analytics.metrics, null, 2),
            },
          },
        ],
        language: "json" as const,
      },
    },
  ];

  return blocks;
}

/**
 * Format conversation data for Notion
 */
export function formatConversationForNotion(conversation: {
  id: string;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
  summary?: string | null;
  completed: boolean;
  createdAt: Date;
}) {
  const messageBlocks = conversation.messages.flatMap((msg, index) => [
    {
      object: "block" as const,
      type: "heading_3" as const,
      heading_3: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `${msg.role === "user" ? "Participant" : "AI"} - Message ${index + 1}`,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: msg.content,
            },
          },
        ],
      },
    },
  ]);

  const blocks = [
    {
      object: "block" as const,
      type: "heading_1" as const,
      heading_1: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Survey Conversation",
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `Conversation ID: ${conversation.id}`,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `Status: ${conversation.completed ? "Completed" : "In Progress"}`,
            },
          },
        ],
      },
    },
    {
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: `Created: ${conversation.createdAt.toLocaleDateString()}`,
            },
          },
        ],
      },
    },
  ];

  if (conversation.summary) {
    blocks.push(
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [
            {
              type: "text" as const,
              text: {
                content: "Summary",
              },
            },
          ],
        },
      },
      {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [
            {
              type: "text" as const,
              text: {
                content: conversation.summary,
              },
            },
          ],
        },
      }
    );
  }

  blocks.push(
    {
      object: "block" as const,
      type: "heading_2" as const,
      heading_2: {
        rich_text: [
          {
            type: "text" as const,
            text: {
              content: "Conversation Messages",
            },
          },
        ],
      },
    },
    ...messageBlocks
  );

  return blocks;
}

/**
 * Create a Notion database for surveys if it doesn't exist
 */
export async function createSurveyDatabase(
  notion: Client,
  parentPageId: string,
  databaseName = "Surveys"
) {
  const response = await notion.databases.create({
    parent: {
      type: "page_id",
      page_id: parentPageId,
    },
    title: [
      {
        type: "text",
        text: {
          content: databaseName,
        },
      },
    ],
    properties: {
      Name: {
        title: {},
      },
      Status: {
        select: {
          options: [
            { name: "draft", color: "gray" },
            { name: "creating", color: "yellow" },
            { name: "sample_review", color: "orange" },
            { name: "active", color: "green" },
            { name: "completed", color: "blue" },
            { name: "archived", color: "red" },
          ],
        },
      },
      "Survey ID": {
        rich_text: {},
      },
      "Created At": {
        date: {},
      },
      "Updated At": {
        date: {},
      },
    },
  });

  return response;
}

/**
 * Export survey to Notion
 */
export async function exportSurveyToNotion(
  notion: Client,
  databaseId: string,
  survey: {
    id: string;
    title: string;
    status: string;
    objective?: Record<string, unknown> | null;
    targetAudience?: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }
) {
  const properties = formatSurveyForNotion(survey);

  const response = await notion.pages.create({
    parent: {
      type: "database_id",
      database_id: databaseId,
    },
    properties,
  });

  return response;
}

/**
 * Export analytics to Notion page
 */
export async function exportAnalyticsToNotion(
  notion: Client,
  parentPageId: string,
  surveyTitle: string,
  analytics: {
    overallSummary: string;
    totalConversations: number;
    averageConversationLength: number;
    metrics: Record<string, unknown>;
  }
) {
  const blocks = formatAnalyticsForNotion(analytics);

  const response = await notion.pages.create({
    parent: {
      type: "page_id",
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: `${surveyTitle} - Analytics`,
            },
          },
        ],
      },
    },
    children: blocks,
  });

  return response;
}

/**
 * Export conversation to Notion page
 */
export async function exportConversationToNotion(
  notion: Client,
  parentPageId: string,
  surveyTitle: string,
  conversation: {
    id: string;
    messages: Array<{ role: string; content: string; timestamp?: string }>;
    summary?: string | null;
    completed: boolean;
    createdAt: Date;
  }
) {
  const blocks = formatConversationForNotion(conversation);

  const response = await notion.pages.create({
    parent: {
      type: "page_id",
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: `${surveyTitle} - Conversation ${conversation.id.substring(0, 8)}`,
            },
          },
        ],
      },
    },
    children: blocks,
  });

  return response;
}
