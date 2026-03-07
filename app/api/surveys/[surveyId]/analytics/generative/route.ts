import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  stepCountIs,
  tool,
} from "ai";
import { z } from "zod";

import { getDb } from "@/db";
import {
  surveys,
  surveyConversations,
  analyticsChatSessions,
  surveyAnalytics,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { gpt41MiniModel } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";

const SESSION_TITLE = "Automated Generative Summary";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "internal-worker-secret";

// Defining tools specific for this route (Generative UI)
const analyticsTools = {
  renderChart: tool({
    description:
      "Render a visualization (Bar, Line, Pie) to represent survey data patterns.",
    inputSchema: z.object({
      type: z
        .enum(["bar", "line", "pie"])
        .describe("The type of chart to render"),
      title: z.string().describe("The title of the chart"),
      description: z
        .string()
        .optional()
        .describe("A brief description of what the chart shows"),
      data: z
        .array(z.any())
        .describe(
          "The data points for the chart. For Bar/Pie: [{ label: string, value: number, color?: string }]. For Line: [{ label: string|number, value: number }]",
        ),
      config: z
        .object({
          xAxisLabel: z.string().optional(),
          yAxisLabel: z.string().optional(),
          dataKey: z.string().optional(),
        })
        .optional(),
    }),
    execute: async (args) => {
      return args;
    },
  }),
  renderTable: tool({
    description:
      "Render a formatted data table to present structured information.",
    inputSchema: z.object({
      title: z.string().describe("The title of the table"),
      description: z
        .string()
        .optional()
        .describe("A brief description of what the table shows"),
      columns: z.array(z.string()).describe("The names of the columns"),
      rows: z
        .array(z.array(z.string()))
        .describe("The data rows, each row being an array of strings"),
    }),
    execute: async (args) => {
      return args;
    },
  }),
};

/**
 * POST /api/surveys/[surveyId]/analytics/generative
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const { surveyId } = await params;
    const body = await request.json().catch(() => ({}));
    const messages: UIMessage[] = body.messages || [];

    // ── Auth: support both user sessions and internal worker calls ─────────
    const isWorkerRequest =
      request.headers.get("x-worker-secret") === WORKER_SECRET;

    let userId: string;

    if (isWorkerRequest) {
      // Internal worker: authenticate via shared secret, use survey's owner
      const [surveyOwner] = await getDb()
        .select({ userId: surveys.userId })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1);

      if (!surveyOwner) {
        return NextResponse.json(
          { error: "Survey not found" },
          { status: 404 },
        );
      }
      userId = surveyOwner.userId;
    } else {
      const session = await getVerifiedSession();
      userId = session.user.id;

      const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
      const access = await getSurveyAccessLevel(userId, surveyId);

      if (access === "none") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // Fetch user preferred language
    const [user] = await getDb()
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(eq(users.id, userId));

    const targetLanguage = user?.preferredLanguage || "en";

    // 1. Fetch survey context
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // 2. Fetch conversation stats
    const conversations = await getDb()
      .select({
        id: surveyConversations.id,
        completed: surveyConversations.completed,
        rawConversation: surveyConversations.rawConversation,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const totalCount = conversations.length;
    const completedCount = conversations.filter((c) => c.completed).length;

    let above50Count = 0;
    let below50Count = 0;

    // Determine >50% or <50% completion based on rawConversation length vs required metrics
    const surveyConfig = buildCompleteSurveyConfig(survey);
    const expectedTurns = (surveyConfig.requiredQuestions?.length || 5) * 2; // Rough estimate of expected turns

    conversations
      .filter((c) => !c.completed)
      .forEach((c) => {
        const turnCount = c.rawConversation?.length || 0;
        if (turnCount >= expectedTurns * 0.5) {
          above50Count++;
        } else {
          below50Count++;
        }
      });

    // 3. Fetch established metrics (analytics context)
    const [analytics] = await getDb()
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    // 4. Construct System Prompt
    const systemPrompt = `You are an expert data analyst providing an automated, rolling summary of survey results.
Your response will be rendered directly in a clean UI.
Rules:
1. Use a highly analytical yet very readable tone.
2. DO NOT use dense markdown cards or overly complicated formatting. Keep paragraphs concise and font small.
3. Your goal is to EXPLAIN the current status of the survey.
4. If there is no data or not enough data to form a conclusion, state: "I haven't collected enough info related to this yet."
5. You MUST use 'renderChart' or 'renderTable' tools if visualizing a trend or metric distribution is helpful.
6. You MUST speak and respond ONLY in the following language: ${targetLanguage}. This includes all text, chart titles, and table headers.

Context Context:
- Survey Title: ${survey.title}
- Core Objective: ${survey.coreObjective || "Not specified"}
- Target Metrics Set by Creator: ${JSON.stringify(survey.metrics || [])}

Current Stats (Include these in your summary):
- Total Responses: ${totalCount}
- Fully Completed: ${completedCount}
- Partially Completed (>50%): ${above50Count}
- Dropped Out (<50%): ${below50Count}

Latest Aggregated Intelligence:
${analytics?.overallSummary ? analytics.overallSummary.substring(0, 1000) : "No aggregated insights yet."}
${analytics?.metrics ? JSON.stringify(analytics.metrics).substring(0, 2000) : "No metrics processed yet."}
`;

    // 5. Check if we have an existing session for "Automated Generative Summary"
    // We will maintain one session per survey specifically for this feature to keep context.
    let [existingSession] = await getDb()
      .select()
      .from(analyticsChatSessions)
      .where(
        and(
          eq(analyticsChatSessions.surveyId, surveyId),
          eq(analyticsChatSessions.title, SESSION_TITLE),
        ),
      )
      .limit(1);

    if (!existingSession) {
      existingSession = (
        await getDb()
          .insert(analyticsChatSessions)
          .values({
            id: crypto.randomUUID(),
            surveyId,
            userId,
            title: SESSION_TITLE,
            messages: [],
          })
          .returning()
      )[0];
    }

    // We combine DB messages + incoming messages if needed,
    // but typically the client's `useChat` will maintain the state or send the full history.
    // We ensure the system prompt bounds it.

    const result = streamText({
      model: gpt41MiniModel,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: analyticsTools,
      stopWhen: stepCountIs(5),
      onFinish: async (streamResult) => {
        // Save the new full message history back to the database to persist context
        // Ensure we convert tools appropriately for storage
        const finalMessages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: streamResult.text || "",
            // For AI SDK 5.0, map tool calls safely
            parts: (
              streamResult.response.messages[
                streamResult.response.messages.length - 1
              ] as any
            )?.content || [{ type: "text", text: streamResult.text }],
          },
        ];

        await getDb()
          .update(analyticsChatSessions)
          .set({
            messages: finalMessages as any,
          })
          .where(eq(analyticsChatSessions.id, existingSession.id));
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Generative Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
