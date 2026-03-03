import { eq } from "drizzle-orm";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { db } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import {  normalizeMessages } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  type CollectedInfo,
} from "@/lib/prompts";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";
import { CreationSpecialist } from "@/lib/agents/creation-specialist";
import { type AgentContext } from "@/lib/agents/types";
import { buildCompleteSurveyConfig } from "@/lib/surveys";

export const maxDuration = 300;

/**
 * Stream a survey creation conversation
 * This guides the survey maker through providing all necessary information
 * Now uses the CreationSpecialist agent for domain-specific interactions
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await apiRateLimiter.limit(clientIP);

    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: rateLimitResult.reset,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": rateLimitResult.reset.toString(),
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          },
        },
      );
    }

    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages } = body as {
      messages: Array<any>;
    };

    if (!Array.isArray(messages)) {
      return new Response("Invalid messages", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return new Response("Unauthorized: Editor access required", {
        status: 403,
      });
    }

    if (survey.status !== "creating") {
      return new Response(
        "Survey is not in creation mode. Status: " + survey.status,
        { status: 400 },
      );
    }

    const [creationConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    const collectedInfo: CollectedInfo =
      creationConversation?.collectedInfo || {
        objective: false,
        targetAudience: false,
        scope: false,
        successCriteria: false,
        constraints: false,
        hypotheses: false,
        tone: false,
        requiredQuestions: false,
        metrics: false,
        personalInfo: false,
        subjectDefined: false,
        domainIdentified: false,
        media: false,
        subjectModelComplete: false,
      };

    // SAVE CONVERSATION STATE (Important for extraction to work)
    const messagesWithTimestamp = messages.map((msg) => {
      let textContent = msg.content;
      if (!textContent && Array.isArray(msg.parts)) {
        textContent = msg.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
      }
      return {
        id: msg.id,
        role: msg.role,
        content: textContent || "",
        parts: msg.parts,
        timestamp: msg.timestamp || new Date().toISOString(),
      };
    });

    if (creationConversation) {
      await db
        .update(surveyCreationConversations)
        .set({
          messages: messagesWithTimestamp,
        })
        .where(eq(surveyCreationConversations.surveyId, surveyId));
    } else {
      await db.insert(surveyCreationConversations).values({
        id: crypto.randomUUID(),
        surveyId,
        messages: messagesWithTimestamp,
        status: "in_progress",
        collectedInfo: collectedInfo,
        extractedData: {},
      });
    }

    // --- AGENT INTEGRATION START ---

    // 1. Build Agent Context
    // We update the survey config with latest extracted data for the agent
    const currentConfig = buildCompleteSurveyConfig(survey);
    const extractedData = creationConversation?.extractedData;

    // Overlay extracted data onto config so agent sees what has been collected
    if (extractedData?.domainId)
      currentConfig.domainId = extractedData.domainId;
    if (extractedData?.objective || extractedData?.targetAudience) {
      currentConfig.expertState = {
        ...currentConfig.expertState,
        objective:
          extractedData?.objective || currentConfig.expertState?.objective,
        targetAudience:
          extractedData?.targetAudience ||
          currentConfig.expertState?.targetAudience,
      };
    }
    // ... other fields are less critical for immediate context, or are handled by extractedData updates

    const outputMessages = await normalizeMessages(messages);

    const agentContext: AgentContext = {
      surveyConfig: currentConfig,
      language: survey.language,
      conversationId: creationConversation?.id || crypto.randomUUID(),
    };

    // 2. Instantiate Creation Specialist
    const agent = new CreationSpecialist(agentContext);
    await agent.initialize();

    // Preload capabilities
    await Promise.all([
      agent.preloadSkills(),
      agent.preloadPatternLearnings(["creation", "general"], 2),
    ]).catch((error) =>
      console.warn(
        "[Create Route] Failed to preload agent capabilities:",
        error,
      ),
    );

    // 3. Get System Prompt from Agent
    const systemPrompt = agent.buildSystemPrompt();

    // 4. Dynamic Resume Logic — only fire for genuine resumes (existing conversation beyond greeting + first reply)
    // The last message is ALWAYS a user message (that's what triggered the POST), so we can't use
    // lastMessage.role === 'user' as the condition — it would always fire.
    // A session is a resume when there are > 3 messages (greeting + at least one full exchange = 3+).
    let dynamicDirective = undefined;
    if (outputMessages.length > 3) {
      dynamicDirective =
        "You are resuming this survey design session. The creator has returned after a pause. Acknowledge naturally and continue where you left off without re-introducing yourself or repeating questions already answered.";
    }

    // 5. Stream response using Agent's prompt and tool logic
    const streamResult = agent.stream(
      outputMessages,
      async (result) => {
        const { text, response } = result;

        // Save the assistant's response when done
        try {
          const assistantMessage = response.messages.find(
            (m: any) => m.role === "assistant",
          );

          // Re-fetch to get latest state in case extraction updated it
          const [latestConv] = await db
            .select()
            .from(surveyCreationConversations)
            .where(eq(surveyCreationConversations.surveyId, surveyId));

          if (latestConv) {
            const currentMessages = latestConv.messages as Array<{
              role: "user" | "assistant";
              content: string;
              timestamp: string;
            }>;

            const updatedMessages = [
              ...currentMessages,
              {
                role: "assistant" as const,
                content: text,
                parts:
                  (assistantMessage as any)?.content &&
                  Array.isArray((assistantMessage as any).content)
                    ? (assistantMessage as any).content
                    : undefined,
                timestamp: new Date().toISOString(),
              },
            ];

            // Extract state_updates from think_and_respond tool calls in the response messages
            // response.messages contains all tool calls with their full args after streaming completes
            const stateUpdates: Record<string, string> = {};
            for (const msg of response.messages) {
              if ((msg as any).role !== "assistant") continue;
              const contentParts = Array.isArray((msg as any).content)
                ? (msg as any).content
                : [];
              for (const part of contentParts) {
                if (
                  part.type === "tool-call" &&
                  part.toolName === "think_and_respond" &&
                  part.args?.state_updates &&
                  Object.keys(part.args.state_updates).length > 0
                ) {
                  Object.assign(stateUpdates, part.args.state_updates);
                }
              }
            }

            const dbUpdate: Record<string, any> = { messages: updatedMessages };

            if (Object.keys(stateUpdates).length > 0) {
              const newCollectedFlags = Object.entries(stateUpdates).reduce(
                (acc, [k, v]) => {
                  if (v && v !== "false" && v !== "null" && v !== "no") {
                    acc[k] = true;
                  }
                  return acc;
                },
                {} as Record<string, boolean>,
              );

              if (Object.keys(newCollectedFlags).length > 0) {
                const existingCollected = (latestConv.collectedInfo ||
                  {}) as Record<string, boolean>;
                const existingExtracted = (latestConv.extractedData ||
                  {}) as Record<string, any>;
                dbUpdate.collectedInfo = {
                  ...existingCollected,
                  ...newCollectedFlags,
                };
                dbUpdate.extractedData = {
                  ...existingExtracted,
                  ...stateUpdates,
                };
                console.log(
                  "[Create Route] Persisting state_updates:",
                  newCollectedFlags,
                );
              }
            }

            await db
              .update(surveyCreationConversations)
              .set(dbUpdate)
              .where(eq(surveyCreationConversations.surveyId, surveyId));
          }
        } catch (error) {
          console.error(
            "Error saving conversation or performing extraction:",
            error,
          );
        }
      },
      dynamicDirective,
    );

    // Use the SDK's own UIMessage stream — it emits the full correct protocol that @ai-sdk/react expects:
    // step-start, text-start, text-delta, text-end, tool invocation parts, step-finish, finish.
    // Writing bare text-delta chunks manually (our old approach) is IGNORED by the client stream processor
    // because it requires the full protocol sequence.
    const filterStream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.merge(streamResult.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream: filterStream });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error in create route:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Save creation conversation messages and extract survey data
 * Called after each AI response to update the conversation state
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, collectedInfo, extractedData } = body as {
      messages?: Array<any>;
      collectedInfo?: CollectedInfo;
      extractedData?: Record<string, unknown>;
    };

    if (messages && !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return new Response("Unauthorized: Editor access required", {
        status: 403,
      });
    }

    const [existingConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    await db.transaction(async (tx) => {
      if (existingConversation) {
        // Build the update payload dynamically — if nothing was provided, skip the DB call entirely
        // (Drizzle throws "No values to set" if .set({}) receives an empty object)
        const updatePayload: Record<string, any> = {};

        if (messages) {
          updatePayload.messages = messages.map((msg) => {
            let textContent = msg.content;
            if (!textContent && Array.isArray(msg.parts)) {
              textContent = msg.parts
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("");
            }
            return {
              id: msg.id,
              role: msg.role,
              content: textContent || "",
              parts: msg.parts,
              timestamp: msg.timestamp || new Date().toISOString(),
            };
          });
        }

        if (collectedInfo) updatePayload.collectedInfo = collectedInfo;

        if (extractedData) {
          updatePayload.extractedData = {
            ...existingConversation.extractedData,
            ...extractedData,
          };
        }

        // Nothing to update — body was empty (e.g. handleStart signal call)
        if (Object.keys(updatePayload).length === 0) {
          return; // exit transaction cleanly, no DB write needed
        }

        await tx
          .update(surveyCreationConversations)
          .set(updatePayload)
          .where(eq(surveyCreationConversations.surveyId, surveyId));
      } else {
        await tx.insert(surveyCreationConversations).values({
          id: crypto.randomUUID(),
          surveyId,
          messages: messages
            ? messages.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content:
                  msg.content ||
                  (Array.isArray(msg.parts)
                    ? msg.parts
                        .filter((p: any) => p.type === "text")
                        .map((p: any) => p.text)
                        .join("")
                    : ""),
                parts: msg.parts,
                timestamp: msg.timestamp || new Date().toISOString(),
              }))
            : [],
          status: "in_progress",
          extractedData: extractedData || {},
          collectedInfo: collectedInfo || {
            objective: false,
            targetAudience: false,
            scope: false,
            successCriteria: false,
            constraints: false,
            hypotheses: false,
            tone: false,
            requiredQuestions: false,
            metrics: false,
            personalInfo: false,
            subjectDefined: false,
            domainIdentified: false,
            media: false,
            subjectModelComplete: false,
          },
        });
      }

      // Bidirectional sync: Push extractedData to the surveys table
      if (extractedData) {
        const currentExpertState = (survey.expertState || {}) as Record<
          string,
          any
        >;
        await tx
          .update(surveys)
          .set({
            expertState: {
              ...currentExpertState,
              ...extractedData,
            },
          })
          .where(eq(surveys.id, surveyId));
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error updating creation conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Get the current state of a survey creation conversation
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return new Response("Unauthorized", { status: 403 });
    }

    const [creationConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!creationConversation) {
      return new Response(
        JSON.stringify({
          collectedInfo: {
            objective: false,
            targetAudience: false,
            scope: false,
            successCriteria: false,
            constraints: false,
            hypotheses: false,
            tone: false,
            requiredQuestions: false,
            metrics: false,
            personalInfo: false,
            subjectDefined: false,
            domainIdentified: false,
          },
          extractedData: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        messages: creationConversation.messages || [],
        collectedInfo: creationConversation.collectedInfo,
        extractedData: creationConversation.extractedData,
        status: creationConversation.status,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error fetching creation conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
