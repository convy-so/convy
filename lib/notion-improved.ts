/**
 * IMPROVED Notion Integration - Production Ready
 * Addresses all critical issues from analysis
 */

import { Client, isNotionClientError, APIErrorCode } from "@notionhq/client";
import type {
  CreatePageParameters,
  BlockObjectRequest,
} from "@notionhq/client/build/src/api-endpoints";
import { env } from "./env";

/**
 * FIXED: Added API version specification
 * Rate limit: 3 requests/second average
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
    notionVersion: "2022-06-28", // ✅ Pinned API version
  });
}

/**
 * NEW: Rate limit handler with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isNotionClientError(error)) {
        if (error.code === APIErrorCode.RateLimited) {
          // Respect Retry-After header
          const retryAfter = error.headers?.['retry-after'];
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : initialDelay * Math.pow(2, i);

          console.warn(
            `[Notion] Rate limited. Retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry other Notion errors
        throw error;
      }

      lastError = error as Error;

      // Retry on network errors
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError!;
}

/**
 * FIXED: Split text into chunks to respect 2000 char limit
 */
export function splitTextIntoChunks(
  text: string,
  maxLength = 1900
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentences to avoid breaking mid-sentence
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // If single sentence exceeds limit, force split by words
      if (sentence.length > maxLength) {
        const words = sentence.split(" ");
        for (const word of words) {
          if ((currentChunk + " " + word).length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? " " : "") + word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * FIXED: Create rich text with proper length limits
 */
export function createRichText(content: string) {
  const chunks = splitTextIntoChunks(content);

  return chunks.map((chunk) => ({
    type: "text" as const,
    text: {
      content: chunk,
    },
  }));
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
  // Ensure title doesn't exceed limits
  const title = survey.title.substring(0, 2000);

  return {
    Name: {
      title: [
        {
          text: {
            content: title,
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
 * FIXED: Format analytics data with text length limits
 */
export function formatAnalyticsForNotion(analytics: {
  overallSummary: string;
  totalConversations: number;
  averageConversationLength: number;
  metrics: Record<string, unknown>;
}): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [
    {
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Survey Analytics",
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Overall Summary",
            },
          },
        ],
      },
    },
  ];

  // FIXED: Split long summaries into multiple paragraphs
  const summaryChunks = splitTextIntoChunks(analytics.overallSummary);
  for (const chunk of summaryChunks) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: chunk,
            },
          },
        ],
      },
    });
  }

  blocks.push(
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Key Metrics",
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Total Conversations: ${analytics.totalConversations}`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Average Conversation Length: ${analytics.averageConversationLength} messages`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Additional Metrics",
            },
          },
        ],
      },
    }
  );

  // FIXED: Split large JSON into chunks
  const metricsJson = JSON.stringify(analytics.metrics, null, 2);
  const jsonChunks = splitTextIntoChunks(metricsJson);

  for (const chunk of jsonChunks) {
    blocks.push({
      object: "block",
      type: "code",
      code: {
        rich_text: [
          {
            type: "text",
            text: {
              content: chunk,
            },
          },
        ],
        language: "json",
      },
    });
  }

  return blocks;
}

/**
 * FIXED: Format conversation with proper text limits
 */
export function formatConversationForNotion(conversation: {
  id: string;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
  summary?: string | null;
  completed: boolean;
  createdAt: Date;
}): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [
    {
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Survey Conversation",
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Conversation ID: ${conversation.id}`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Status: ${conversation.completed ? "Completed" : "In Progress"}`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Created: ${conversation.createdAt.toLocaleDateString()}`,
            },
          },
        ],
      },
    },
  ];

  // Add summary if available
  if (conversation.summary) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Summary",
            },
          },
        ],
      },
    });

    // FIXED: Split long summary
    const summaryChunks = splitTextIntoChunks(conversation.summary);
    for (const chunk of summaryChunks) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: chunk,
              },
            },
          ],
        },
      });
    }
  }

  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: {
            content: "Conversation Messages",
          },
        },
      },
    },
  });

  // Add messages with proper chunking
  for (const [index, msg] of conversation.messages.entries()) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `${msg.role === "user" ? "Participant" : "AI"} - Message ${index + 1}`,
            },
          },
        ],
      },
    });

    // FIXED: Split long message content
    const contentChunks = splitTextIntoChunks(msg.content);
    for (const chunk of contentChunks) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: chunk,
              },
            },
          ],
        },
      });
    }
  }

  return blocks;
}

/**
 * Create a Notion database for surveys
 */
export async function createSurveyDatabase(
  notion: Client,
  parentPageId: string,
  databaseName = "Surveys"
) {
  return await withRetry(() =>
    notion.databases.create({
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
    })
  );
}

/**
 * Export survey to Notion with retry logic
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

  return await withRetry(() =>
    notion.pages.create({
      parent: {
        type: "database_id",
        database_id: databaseId,
      },
      properties,
    })
  );
}

/**
 * FIXED: Export analytics with block pagination
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

  // Split into batches of 100
  const initialBlocks = blocks.slice(0, 100);
  const remainingBlocks = blocks.slice(100);

  // Create page with first 100 blocks
  const response = await withRetry(() =>
    notion.pages.create({
      parent: {
        type: "page_id",
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: `${surveyTitle} - Analytics`.substring(0, 2000),
              },
            },
          ],
        },
      },
      children: initialBlocks,
    })
  );

  // Append remaining blocks in batches of 100
  if (remainingBlocks.length > 0) {
    for (let i = 0; i < remainingBlocks.length; i += 100) {
      const batch = remainingBlocks.slice(i, i + 100);
      await withRetry(() =>
        notion.blocks.children.append({
          block_id: response.id,
          children: batch,
        })
      );
    }
  }

  return response;
}

/**
 * FIXED: Export conversation with block pagination
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

  // Split into batches of 100
  const initialBlocks = blocks.slice(0, 100);
  const remainingBlocks = blocks.slice(100);

  // Create page with first 100 blocks
  const response = await withRetry(() =>
    notion.pages.create({
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
      children: initialBlocks,
    })
  );

  // Append remaining blocks in batches of 100
  if (remainingBlocks.length > 0) {
    for (let i = 0; i < remainingBlocks.length; i += 100) {
      const batch = remainingBlocks.slice(i, i + 100);
      await withRetry(() =>
        notion.blocks.children.append({
          block_id: response.id,
          children: batch,
        })
      );
    }
  }

  return response;
}

/**
 * NEW: Validate Notion token with proper error handling
 */
export async function validateNotionToken(
  token: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const notion = getNotionClient(token);

    await withRetry(() =>
      notion.search({
        filter: { property: "object", value: "page" },
        page_size: 1,
      })
    );

    return { valid: true };
  } catch (error: unknown) {
    if (isNotionClientError(error)) {
      switch (error.code) {
        case APIErrorCode.Unauthorized:
          return { valid: false, error: "Invalid or expired token" };
        case APIErrorCode.RestrictedResource:
          return { valid: false, error: "Insufficient permissions" };
        case APIErrorCode.RateLimited:
          return { valid: false, error: "Rate limit exceeded. Try again later" };
        default:
          return { valid: false, error: `Notion error: ${error.message}` };
      }
    }

    return { valid: false, error: "Unknown error occurred" };
  }
}
