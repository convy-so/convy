import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { logUsage } from "@/shared/billing/logger";
import { type AppLocale } from "@/shared/i18n/config";
import {
  buildBatchTranslationPrompt,
  buildConversationTranslationPrompt,
} from "@/shared/i18n/translation-prompts";
import { createLogger, serializeError } from "@/shared/infra/logger";

const log = createLogger("translation");


/**
 * Translation Service for Locale-Aware Survey System
 * Handles conversation translation for dual storage (raw + translated)
 */

export type SupportedLanguage = AppLocale;
const TRANSLATION_MODEL_NAME = "gemini-2.5-flash-lite";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface TranslationResult {
  translatedConversation: ConversationMessage[];
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
}

export async function translateTextBatch(
  items: string[],
  targetLanguage: SupportedLanguage,
  metadata?: {
    userId?: string;
    surveyId?: string;
    task?: string;
  },
): Promise<string[]> {
  const normalizedItems = items.map((item) => item.trim());
  if (normalizedItems.length === 0) {
    return [];
  }

  const prompt = buildBatchTranslationPrompt(
    normalizedItems,
    targetLanguage,
    metadata,
  );

  try {
    const { text, usage } = await generateText({
      model: google(TRANSLATION_MODEL_NAME),
      prompt,
      temperature: 0.2,
    });

    void logUsage({
      userId: metadata?.userId,
      surveyId: metadata?.surveyId,
      type: "llm_text",
      provider: "google",
      modelName: TRANSLATION_MODEL_NAME,
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });

    const parsed = JSON.parse(text) as { items?: unknown };
    if (
      Array.isArray(parsed.items) &&
      parsed.items.length === normalizedItems.length &&
      parsed.items.every((item) => typeof item === "string")
    ) {
      return parsed.items;
    }
  } catch (error) {
    log.error("translateTextBatch failed; returning original items", {
      target_language: targetLanguage,
      item_count: normalizedItems.length,
      task: metadata?.task ?? "",
      ...serializeError(error),
    });
  }

  return normalizedItems;
}

/**
 * Translate a conversation from one language to another
 * Uses Gemini for accurate, context-aware translation
 */
export async function translateConversation(
  conversation: ConversationMessage[],
  sourceLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage,
  metadata?: {
    userId?: string;
    surveyId?: string;
  },
): Promise<TranslationResult> {
  // If source and target are the same, return unchanged
  if (sourceLanguage === targetLanguage) {
    return {
      translatedConversation: conversation,
      sourceLanguage,
      targetLanguage,
    };
  }

  // Build translation prompt
  const conversationText = conversation
    .map(
      (msg) => `${msg.role === "user" ? "RESPONDENT" : "AI"}: ${msg.content}`,
    )
    .join("\n\n");

  const prompt = buildConversationTranslationPrompt({
    sourceLanguage,
    targetLanguage,
    conversationText,
  });

  try {
    const { text, usage } = await generateText({
      model: google(TRANSLATION_MODEL_NAME),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    // Log usage for translation
    void logUsage({
      userId: metadata?.userId,
      surveyId: metadata?.surveyId,
      type: "llm_text",
      provider: "google",
      modelName: TRANSLATION_MODEL_NAME,
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });

    // Parse the translated text back into conversation format
    const translatedMessages: ConversationMessage[] = [];
    const lines = text.trim().split("\n");

    let currentRole: "user" | "assistant" | null = null;
    let currentContent = "";
    const flushCurrentMessage = () => {
      if (!currentRole || !currentContent) {
        return;
      }

      translatedMessages.push({
        role: currentRole,
        content: currentContent.trim(),
        timestamp:
          conversation[translatedMessages.length]?.timestamp ||
          new Date().toISOString(),
      });
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("RESPONDENT:")) {
        flushCurrentMessage();
        currentRole = "user";
        currentContent = trimmedLine.substring("RESPONDENT:".length).trim();
      } else if (trimmedLine.startsWith("AI:")) {
        flushCurrentMessage();
        currentRole = "assistant";
        currentContent = trimmedLine.substring("AI:".length).trim();
      } else if (trimmedLine && currentRole) {
        currentContent += " " + trimmedLine;
      }
    }

    flushCurrentMessage();

    // Validate we got the same number of messages
    if (translatedMessages.length !== conversation.length) {
      return {
        translatedConversation: conversation,
        sourceLanguage,
        targetLanguage,
      };
    }

    return {
      translatedConversation: translatedMessages,
      sourceLanguage,
      targetLanguage,
    };
  } catch (error) {
    log.error("translateConversation failed; returning original conversation", {
      source_language: sourceLanguage,
      target_language: targetLanguage,
      message_count: conversation.length,
      ...serializeError(error),
    });
    return {
      translatedConversation: conversation,
      sourceLanguage,
      targetLanguage,
    };
  }
}

/**
 * Batch translate multiple conversations for efficiency
 */
export async function batchTranslateConversations(
  conversations: Array<{
    id: string;
    messages: ConversationMessage[];
    sourceLanguage: SupportedLanguage;
  }>,
  targetLanguage: SupportedLanguage,
): Promise<Map<string, ConversationMessage[]>> {
  const results = new Map<string, ConversationMessage[]>();

  // Translate conversations in parallel (with reasonable concurrency limit)
  const BATCH_SIZE = 5;
  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (conv) => {
        const result = await translateConversation(
          conv.messages,
          conv.sourceLanguage,
          targetLanguage,
        );
        return { id: conv.id, translated: result.translatedConversation };
      }),
    );

    for (const { id, translated } of batchResults) {
      results.set(id, translated);
    }
  }

  return results;
}

/**
 * Get user's preferred language from database
 */
export async function getUserPreferredLanguage(
  userId: string,
): Promise<SupportedLanguage> {
  try {
    const { getDb } = await import("@/shared/db");
    const { users } = await import("@/shared/db/schema");
    const { eq } = await import("drizzle-orm");

    const [user] = await getDb()
      .select({ preferredLanguage: users.preferredLanguage, uiLocale: users.uiLocale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const locale = user?.uiLocale ?? user?.preferredLanguage;
    switch (locale) {
      case "fr":
      case "de":
      case "en":
        return locale;
      default:
        return "en";
    }
  } catch (error) {
    log.error("getUserPreferredLanguage failed; defaulting to en", {
      ...serializeError(error),
    });
    return "en";
  }
}
