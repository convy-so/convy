import { eq } from "drizzle-orm";
import { streamText, generateText, Output, tool, stepCountIs } from "ai";
import { z } from "zod";

import { db } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { defaultModel, analysisModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";
import { CreationSpecialist } from "@/lib/agents/creation-specialist";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import type { AgentContext } from "@/lib/agents/types";

export const maxDuration = 300;

/**
 * Perform incremental extraction of survey data from conversation
 * This runs async after each exchange to keep extracted data current
 */
async function performIncrementalExtraction(
  surveyId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<void> {
  try {
    // Extract after at least 2 messages (1 user message + AI welcome)
    if (messages.length < 2) return;

    console.log(
      `[Create Route] Starting extraction for survey ${surveyId} with ${messages.length} messages`,
    );

    const extractionPrompt = getSurveyDataExtractionPrompt(messages);

    const extractionSchema = z.object({
      objective: z
        .object({
          goal: z.string().min(5, "Goal must be descriptive").nullable(),
          context: z.string().min(5, "Context must be descriptive").nullable(),
          decision: z
            .string()
            .min(5, "Decision must be descriptive")
            .nullable(),
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
      tone: z.enum(["formal", "casual", "playful", "empathetic"]).nullable(),
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
          }),
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
        requiredQuestions: z.boolean(),
        metrics: z.boolean(),
        personalInfo: z.boolean(),
        subjectDefined: z.boolean(),
        domainIdentified: z.boolean(),
        media: z.boolean(),
      }),
      isVoice: z.boolean().nullable(),
    });

    const { output: parsed } = await generateText({
      model: analysisModel,
      output: Output.object({ schema: extractionSchema }),
      prompt: extractionPrompt,
      system:
        "You are an expert survey designer. Extract structured data from the conversation.",
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
    const defaultCollectedInfo: CollectedInfo = {
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

    await db
      .update(surveyCreationConversations)
      .set({
        extractedData: mergedData,
        collectedInfo: {
          ...defaultCollectedInfo,
          ...(currentConv.collectedInfo || {}),
          ...(collectedInfo || {}),
        },
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    console.log(
      `[Create Route] Incremental extraction completed for survey ${surveyId}`,
    );
  } catch (error) {
    console.error("[Create Route] Incremental extraction error:", error);
    // Non-critical - continue without extraction update
  }
}

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

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
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

    // --- AGENT INTEGRATION START ---

    // 1. Build Agent Context
    // We update the survey config with latest extracted data for the agent
    const currentConfig = buildCompleteSurveyConfig(survey);
    const extractedData = creationConversation?.extractedData;

    // Overlay extracted data onto config so agent sees what has been collected
    if (extractedData?.domainId)
      currentConfig.domainId = extractedData.domainId;
    if (extractedData?.objective)
      currentConfig.objective = extractedData.objective;
    if (extractedData?.targetAudience)
      currentConfig.targetAudience = extractedData.targetAudience;
    // ... other fields are less critical for immediate context, or are handled by extractedData updates

    const outputMessages =
      messages.length > 0
        ? messages
        : [
            {
              role: "user",
              content:
                "Start the conversation by introducing yourself as the expert on this domain and asking the first question.",
            },
          ];

    const agentContext: AgentContext = {
      surveyConfig: currentConfig,
      language: survey.language,
      conversationId: creationConversation?.id || crypto.randomUUID(),
    };

    // 2. Instantiate Creation Specialist
    const agent = new CreationSpecialist(agentContext);

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

    // 4. Stream response using Agent's prompt and tool logic
    // We recreate the tools here to ensure we can hook into onFinish correctly
    // mirroring the logic from CreationSpecialist.stream() but adding the route-specific side effects.

    const streamResult = streamText({
      model: defaultModel,
      messages: outputMessages as any,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500, // Agentic responses can be longer
      stopWhen: stepCountIs(10), // Use stepCountIs as requested by user
      tools: {
        loadSkill: tool({
          description:
            "Load detailed instructions for a specific specialized skill.",
          inputSchema: z.object({
            skillId: z
              .string()
              .describe("The ID of the skill to load (e.g., 'BiasDetector')"),
          }),
          execute: async ({ skillId }) => {
            const { SkillRegistry } =
              await import("@/lib/agents/skill-registry");
            const skill = await SkillRegistry.getSkill(skillId);
            if (!skill) return { error: "Skill not found" };
            return { instructions: skill.content };
          },
        }),
        finishSurvey: tool({
          description:
            "Signal that all required survey information has been collected and the survey design is complete.",
          inputSchema: z.object({
            summary: z
              .string()
              .describe("Brief summary of the survey that was designed"),
          }),
          execute: async ({ summary }) => ({
            success: true,
            message: "Survey design complete",
            summary,
          }),
        }),
        requestMediaUpload: tool({
          description:
            "Request the user to upload media (image, audio, or video) to include in the survey.",
          inputSchema: z.object({
            reason: z
              .string()
              .describe(
                "Why you are requesting media and how it will be used in the survey",
              ),
          }),
          execute: async ({ reason }) => ({
            success: true,
            message: "Media upload requested",
            reason,
          }),
        }),
      },
      onFinish: async ({ text, response }) => {
        // Save the assistant's response when done
        try {
          const assistantMessage = response.messages.find(
            (m) => m.role === "assistant",
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

            await db
              .update(surveyCreationConversations)
              .set({
                messages: updatedMessages,
              })
              .where(eq(surveyCreationConversations.surveyId, surveyId));

            // Logic for triggering extraction and completion checks
            const completionPhrases = [
              "ready to publish",
              "all set",
              "created your survey",
              "survey is ready",
              "looks good",
              "finalized",
              "try sample",
              "go to sample conversations",
              "survey design complete",
            ];
            const isCompletionVariable = completionPhrases.some((phrase) =>
              text.toLowerCase().includes(phrase),
            );

            const shouldExtract =
              updatedMessages.length <= 2 ||
              isCompletionVariable ||
              updatedMessages.length % 2 === 0;

            if (shouldExtract) {
              console.log(
                `[Create Route] Triggering extraction (Reason: ${isCompletionVariable ? "Completion" : "Interval"})`,
              );
              await performIncrementalExtraction(surveyId, updatedMessages);
            }
          }
        } catch (error) {
          console.error(
            "Error saving conversation or performing extraction:",
            error,
          );
        }
      },
    });

    return streamResult.toUIMessageStreamResponse();
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

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    const [existingConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (existingConversation) {
      await db
        .update(surveyCreationConversations)
        .set({
          ...(messages && {
            messages: messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              parts: msg.parts,
              timestamp: msg.timestamp || new Date().toISOString(),
            })),
          }),
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
        messages: messages
          ? messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              parts: msg.parts,
              timestamp: msg.timestamp || new Date().toISOString(),
            }))
          : [],
        status: "in_progress",
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
