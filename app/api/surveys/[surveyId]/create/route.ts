import { eq } from "drizzle-orm";
import { streamText, generateText } from "ai";
import { z } from "zod";

import { db } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { defaultModel, analysisModel, generateAIResponse } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyCreationSystemPrompt,
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";

export const maxDuration = 300;

/**
 * Perform incremental extraction of survey data from conversation
 * This runs async after each exchange to keep extracted data current
 */
async function performIncrementalExtraction(
  surveyId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  try {
    // Extract after at least 2 messages (1 user message + AI welcome)
    if (messages.length < 2) return;
    
    console.log(`[Create Route] Starting extraction for survey ${surveyId} with ${messages.length} messages`);

    const extractionPrompt = getSurveyDataExtractionPrompt(messages);

    const extractionSchema = z.object({
      objective: z
        .object({
          goal: z.string().min(5, "Goal must be descriptive").nullable(),
          context: z.string().min(5, "Context must be descriptive").nullable(),
          decision: z.string().min(5, "Decision must be descriptive").nullable(),
          subjectDomain: z.string().min(2).nullable(),
          subjectDescription: z.string().min(5).nullable(),
        })
        .nullable(),
      targetAudience: z
        .object({
          description: z.string().min(5).nullable(),
          relationship: z.string().min(2).nullable(),
          knowledgeLevel: z.string().nullable(),
        })
        .nullable(),
      scope: z
        .object({
          breadthVsDepth: z.enum(["broad", "deep", "balanced"]).nullable(),
          mainTopics: z.array(z.string().min(2)).nullable(),
          boundaries: z.string().min(5).nullable(),
        })
        .nullable(),
      successCriteria: z
        .object({
          insightTypes: z
            .array(z.enum(["emotional", "behavioral", "rational"]))
            .nullable(),
          detailLevel: z.enum(["high", "medium", "low"]).nullable(),
          description: z.string().min(5).nullable(),
        })
        .nullable(),
      constraints: z
        .object({
          timeLimit: z.number().positive().max(60).nullable(),
          sensitiveTopics: z.array(z.string()).nullable(),
          otherConstraints: z.string().nullable(),
        })
        .nullable(),
      hypotheses: z
        .object({
          assumptions: z.array(z.string().min(5)).nullable(),
        })
        .nullable(),
      tone: z
        .enum(["formal", "casual", "playful", "empathetic"])
        .nullable(),
      additionalContext: z.string().nullable(),
      requiredQuestions: z.array(z.string().min(5)).nullable(),
      metrics: z.array(z.string().min(2)).nullable(),
      personalInfo: z.array(z.string()).nullable(),
      domainId: z.number().int().min(1).max(10).nullable(),
      media: z
        .array(
          z.object({
            type: z.enum(["image", "audio", "video"]),
            description: z.string().min(5),
            contextForUse: z.string().min(5),
            priority: z.enum(["high", "medium", "low"]).nullable(),
          })
        )
        .nullable(),
      collectedInfo: z.object({
        objective: z.boolean(),
        targetAudience: z.boolean(),
        scope: z.boolean(),
        successCriteria: z.boolean(),
        constraints: z.boolean(),
        hypotheses: z.boolean(),
        tone: z.boolean(),
        additionalContext: z.boolean(),
        requiredQuestions: z.boolean(),
        metrics: z.boolean(),
        personalInfo: z.boolean(),
        subjectDefined: z.boolean(),
        domainIdentified: z.boolean(),
        media: z.boolean(),
      }),
    });

    const { object: parsed } = await generateText({
      model: analysisModel,
      output: {
        schema: extractionSchema,
      },
      prompt: extractionPrompt,
      system: "You are an expert survey designer. Extract structured data from the conversation.",
      temperature: 0.3,
    });

    // Extract collectedInfo and data
    const { collectedInfo, ...dataWithoutCollectedInfo } = parsed;

    // Get current conversation to merge data
    const [currentConv] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!currentConv) return;

    // Merge new data with existing (don't overwrite with nulls)
    const existingData = currentConv.extractedData || {};
    const mergedData: Record<string, unknown> = { ...existingData };

    for (const [key, value] of Object.entries(dataWithoutCollectedInfo)) {
      if (value !== null && value !== undefined) {
        mergedData[key] = value;
      }
    }

    // Update conversation with incremental extraction
    await db
      .update(surveyCreationConversations)
      .set({
        extractedData: mergedData,
        collectedInfo: collectedInfo || currentConv.collectedInfo,
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    console.log(
      `[Create Route] Incremental extraction completed for survey ${surveyId}`
    );
  } catch (error) {
    console.error("[Create Route] Incremental extraction error:", error);
    // Non-critical - continue without extraction update
  }
}

/**
 * Stream a survey creation conversation
 * This guides the survey maker through providing all necessary information
 * Now includes incremental data extraction for better reliability
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
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
        }
      );
    }

    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
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

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    if (survey.status !== "creating") {
      return new Response(
        "Survey is not in creation mode. Status: " + survey.status,
        { status: 400 }
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
        additionalContext: false,
        requiredQuestions: false,
        metrics: false,
        personalInfo: false,
      };

    // SAVE CONVERSATION STATE (Important for extraction to work)
    const messagesWithTimestamp = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: new Date().toISOString(),
    }));

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

    const systemPrompt = getSurveyCreationSystemPrompt(
      collectedInfo,
      survey.language
    );

    const result = streamText({
      model: defaultModel,
      messages,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500,
      onFinish: async ({ text }) => {
        // Save the assistant's response when done
        try {
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
                timestamp: new Date().toISOString(),
              },
            ];
            
            await db
              .update(surveyCreationConversations)
              .set({
                messages: updatedMessages,
              })
              .where(eq(surveyCreationConversations.surveyId, surveyId));

            // Trigger incremental extraction (await to ensure it runs before lambda dies)
            await performIncrementalExtraction(surveyId, updatedMessages);
          }
        } catch (error) {
          console.error("Error saving conversation or performing extraction:", error);
        }
      },
    });

    return result.toTextStreamResponse();
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
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, collectedInfo, extractedData } = body as {
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: string;
      }>;
      collectedInfo?: CollectedInfo;
      extractedData?: Record<string, unknown>;
    };

    if (!Array.isArray(messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    const [existingConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    const messagesWithTimestamp = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString(),
    }));

    if (existingConversation) {
      await db
        .update(surveyCreationConversations)
        .set({
          messages: messagesWithTimestamp,
          ...(collectedInfo && { collectedInfo }),
          ...(extractedData && {
            extractedData: {
              ...existingConversation.extractedData,
              ...extractedData,
            },
          }),
        })
        .where(eq(surveyCreationConversations.surveyId, surveyId));
    } else {
      await db.insert(surveyCreationConversations).values({
        id: crypto.randomUUID(),
        surveyId,
        messages: messagesWithTimestamp,
        status: "in_progress",
        collectedInfo: collectedInfo || {
          objective: false,
          targetAudience: false,
          scope: false,
          successCriteria: false,
          constraints: false,
          hypotheses: false,
          tone: false,
          additionalContext: false,
          requiredQuestions: false,
          metrics: false,
          personalInfo: false,
        },
        extractedData: extractedData || {},
      });
    }

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
  { params }: { params: Promise<{ surveyId: string }> }
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

    if (survey.userId !== session.user.id) {
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
            objective: false, targetAudience: false, scope: false, successCriteria: false,
            constraints: false, hypotheses: false, tone: false, additionalContext: false,
            requiredQuestions: false, metrics: false, personalInfo: false,
          },
          extractedData: {}
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        collectedInfo: creationConversation.collectedInfo,
        extractedData: creationConversation.extractedData,
        status: creationConversation.status,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
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

