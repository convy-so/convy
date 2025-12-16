"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  surveys,
  surveyCreationConversations,
  type SurveyObjective,
  type SurveyTargetAudience,
  type SurveyScope,
  type SurveySuccessCriteria,
  type SurveyConstraints,
  type SurveyHypotheses,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyDataExtractionPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import type { ToneProfile } from "@/lib/surveys";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const startSurveyCreationSchema = z.object({
  language: z.enum(["en", "fr", "de"]).optional().default("en"),
});

const extractedDataSchema = z.object({
  objective: z
    .object({
      goal: z.string(),
      context: z.string(),
      decision: z.string(),
    })
    .optional()
    .nullable(),
  targetAudience: z
    .object({
      description: z.string(),
      relationship: z.string(),
      knowledgeLevel: z.string(),
    })
    .optional()
    .nullable(),
  scope: z
    .object({
      breadthVsDepth: z.enum(["broad", "deep", "balanced"]),
      mainTopics: z.array(z.string()),
      boundaries: z.string(),
    })
    .optional()
    .nullable(),
  successCriteria: z
    .object({
      insightTypes: z.array(z.enum(["emotional", "behavioral", "rational"])),
      detailLevel: z.enum(["high", "medium", "low"]),
      description: z.string(),
    })
    .optional()
    .nullable(),
  constraints: z
    .object({
      timeLimit: z
        .number()
        .max(30, "Time limit cannot exceed 30 minutes")
        .nullable(),
      sensitiveTopics: z.array(z.string()),
      otherConstraints: z.string(),
    })
    .optional()
    .nullable(),
  hypotheses: z
    .object({
      assumptions: z.array(z.string()),
    })
    .optional()
    .nullable(),
  tone: z
    .enum(["formal", "casual", "playful", "empathetic"])
    .optional()
    .nullable(),
  additionalContext: z.string().optional().nullable(),
  requiredQuestions: z.array(z.string()).optional().nullable(),
  metrics: z.array(z.string()).optional().nullable(),
  personalInfo: z.array(z.string()).optional().nullable(),
  title: z.string().optional(),
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
  }),
});

/**
 * Start a new survey creation conversation
 * Creates a survey in "creating" status with a creation conversation record
 */
export async function startSurveyCreationAction(
  input: z.infer<typeof startSurveyCreationSchema> = { language: "en" }
): Promise<ActionResult<{ surveyId: string; conversationId: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = startSurveyCreationSchema.parse(input);

    const surveyId = nanoid();
    const conversationId = nanoid();

    await db.insert(surveys).values({
      id: surveyId,
      userId: session.user.id,
      title: "Untitled Survey",
      status: "creating",
      language: body.language,
    });

    await db.insert(surveyCreationConversations).values({
      id: conversationId,
      surveyId,
      messages: [],
      status: "in_progress",
      collectedInfo: {
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
      },
      extractedData: {},
    });

    return {
      success: true,
      data: { surveyId, conversationId },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to start survey creation" };
  }
}

/**
 * Get the current state of a survey creation conversation
 */
export async function getSurveyCreationStateAction(surveyId: string): Promise<
  ActionResult<{
    survey: {
      id: string;
      title: string;
      status: string;
      language: "en" | "fr" | "de";
    };
    conversation: {
      id: string;
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
      }>;
      status: string;
      collectedInfo: CollectedInfo;
      extractedData: Record<string, unknown>;
    } | null;
  }>
> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const [conversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    return {
      success: true,
      data: {
        survey: {
          id: survey.id,
          title: survey.title,
          status: survey.status,
          language: survey.language,
        },
        conversation: conversation
          ? {
              id: conversation.id,
              messages: conversation.messages,
              status: conversation.status,
              collectedInfo: conversation.collectedInfo ?? {
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
              },
              extractedData: conversation.extractedData ?? {},
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get survey creation state" };
  }
}

/**
 * Extract survey data from the creation conversation using AI
 * This analyzes the conversation and extracts structured data
 */
export async function extractSurveyDataAction(
  surveyId: string
): Promise<ActionResult<z.infer<typeof extractedDataSchema>>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const [conversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!conversation || conversation.messages.length === 0) {
      return { success: false, error: "No conversation found" };
    }

    const extractionPrompt = getSurveyDataExtractionPrompt(
      conversation.messages.map((m) => ({ role: m.role, content: m.content }))
    );

    const extractedText = await generateAIResponse(
      extractionPrompt,
      undefined,
      {
        model: analysisModel,
        temperature: 0.3,
        maxTokens: 2000,
      }
    );

    let extractedData: z.infer<typeof extractedDataSchema>;
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extractedData = extractedDataSchema.parse(parsed);
      } else {
        return {
          success: false,
          error: "Failed to parse extracted data",
        };
      }
    } catch (parseError) {
      console.error("Error parsing extracted data:", parseError);
      return {
        success: false,
        error: "Failed to parse extracted data from AI response",
      };
    }

    // Separate collectedInfo from extractedData before saving
    const { collectedInfo, ...dataWithoutCollectedInfo } = extractedData;

    // Convert null values to undefined for database compatibility
    const cleanedData = Object.fromEntries(
      Object.entries(dataWithoutCollectedInfo).map(([key, value]) => [
        key,
        value === null ? undefined : value,
      ])
    );

    await db
      .update(surveyCreationConversations)
      .set({
        extractedData: cleanedData,
        collectedInfo: collectedInfo,
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    return { success: true, data: extractedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to extract survey data" };
  }
}

/**
 * Finalize the survey creation conversation and transition to draft/sample_review
 * This applies the extracted data to the survey and prepares it for sample conversations
 */
export async function finalizeSurveyCreationAction(
  surveyId: string
): Promise<ActionResult<{ surveyId: string; status: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "creating") {
      return {
        success: false,
        error: "Survey is not in creation mode",
      };
    }

    const [conversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!conversation) {
      return { success: false, error: "No creation conversation found" };
    }

    const { extractedData, collectedInfo } = conversation;

    if (!collectedInfo) {
      return {
        success: false,
        error: "Survey creation conversation is incomplete",
      };
    }

    const requiredFields: (keyof CollectedInfo)[] = [
      "objective",
      "targetAudience",
      "scope",
      "successCriteria",
      "constraints",
    ];

    const missingFields = requiredFields.filter(
      (field) => !collectedInfo[field]
    );

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Missing required information: ${missingFields.join(", ")}`,
      };
    }

    const data = extractedData as {
      objective?: SurveyObjective;
      targetAudience?: SurveyTargetAudience;
      scope?: SurveyScope;
      successCriteria?: SurveySuccessCriteria;
      constraints?: SurveyConstraints;
      hypotheses?: SurveyHypotheses;
      tone?: ToneProfile;
      additionalContext?: string;
      requiredQuestions?: string[];
      metrics?: string[];
      personalInfo?: string[];
      title?: string;
    };

    const shareableLink = `survey-${nanoid(12)}`;

    await db
      .update(surveys)
      .set({
        title: data.title || "Untitled Survey",
        objective: data.objective,
        targetAudience: data.targetAudience,
        scope: data.scope,
        successCriteria: data.successCriteria,
        constraints: data.constraints,
        hypotheses: data.hypotheses,
        tone: data.tone || "casual",
        additionalContext: data.additionalContext,
        requiredQuestions: data.requiredQuestions || [],
        metrics: data.metrics || [],
        personalInfo: data.personalInfo || [],
        status: "draft",
        shareableLink,
      })
      .where(eq(surveys.id, surveyId));

    await db
      .update(surveyCreationConversations)
      .set({ status: "completed" })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    return {
      success: true,
      data: { surveyId, status: "draft" },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to finalize survey creation" };
  }
}

/**
 * Abandon a survey creation conversation
 * This marks the conversation as abandoned and can optionally delete the survey
 */
export async function abandonSurveyCreationAction(
  surveyId: string,
  deleteSurvey: boolean = false
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (deleteSurvey) {
      await db.delete(surveys).where(eq(surveys.id, surveyId));
    } else {
      await db
        .update(surveyCreationConversations)
        .set({ status: "abandoned" })
        .where(eq(surveyCreationConversations.surveyId, surveyId));
    }

    return { success: true, data: { success: true } };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to abandon survey creation" };
  }
}

/**
 * Resume a previously started survey creation conversation
 */
export async function resumeSurveyCreationAction(surveyId: string): Promise<
  ActionResult<{
    surveyId: string;
    conversationId: string;
    messages: Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: string;
    }>;
    collectedInfo: CollectedInfo;
  }>
> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "creating") {
      return {
        success: false,
        error: "Survey is not in creation mode",
      };
    }

    const [conversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!conversation) {
      return { success: false, error: "No creation conversation found" };
    }

    if (conversation.status === "completed") {
      return {
        success: false,
        error: "Creation conversation is already completed",
      };
    }

    if (conversation.status === "abandoned") {
      await db
        .update(surveyCreationConversations)
        .set({ status: "in_progress" })
        .where(eq(surveyCreationConversations.surveyId, surveyId));
    }

    return {
      success: true,
      data: {
        surveyId,
        conversationId: conversation.id,
        messages: conversation.messages,
        collectedInfo: conversation.collectedInfo ?? {
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
        },
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to resume survey creation" };
  }
}
