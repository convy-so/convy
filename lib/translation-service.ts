import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { logUsage } from "./billing/logger";
import { appLocaleLabels, type AppLocale } from "@/lib/i18n/config";

/**
 * Translation Service for Locale-Aware Survey System
 * Handles conversation translation for dual storage (raw + translated)
 */

export type SupportedLanguage = AppLocale;

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

  const prompt = `You are a professional translator. Translate each item into ${appLocaleLabels[targetLanguage]}.

CRITICAL INSTRUCTIONS:
1. Return valid JSON only.
2. Keep array order exactly the same.
3. Preserve tone, meaning, and specificity.
4. If an item is already in the target language, keep it natural and unchanged unless a clearer translation is required.
5. Do not add explanations.

Return this schema exactly:
{"items":["translated string 1","translated string 2"]}

Task context: ${metadata?.task ?? "product UI content"}

Items:
${JSON.stringify(normalizedItems, null, 2)}`;

  try {
    const { text, usage } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      prompt,
      temperature: 0.2,
    });

    logUsage({
      userId: metadata?.userId,
      surveyId: metadata?.surveyId,
      type: "llm_text",
      provider: "google",
      modelName: "gemini-2.5-flash-lite",
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

  const prompt = `You are a professional translator. Translate the following survey conversation from ${appLocaleLabels[sourceLanguage]} to ${appLocaleLabels[targetLanguage]}.

CRITICAL INSTRUCTIONS:
1. Maintain the exact structure: each line should start with either "RESPONDENT:" or "AI:"
2. Translate the content accurately while preserving meaning, tone, and context
3. Keep the conversation natural in the target language
4. Do NOT add any additional commentary or explanations
5. Output ONLY the translated conversation in the exact same format

Original Conversation (${appLocaleLabels[sourceLanguage]}):
---
${conversationText}
---

Translated Conversation (${appLocaleLabels[targetLanguage]}):`;

  try {
    const { text, usage } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    // Log usage for translation
    logUsage({
      userId: metadata?.userId,
      surveyId: metadata?.surveyId,
      type: "llm_text",
      provider: "google",
      modelName: "gemini-2.5-flash-lite",
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });

    // Parse the translated text back into conversation format
    const translatedMessages: ConversationMessage[] = [];
    const lines = text.trim().split("\n");

    let currentRole: "user" | "assistant" | null = null;
    let currentContent = "";

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("RESPONDENT:")) {
        // Save previous message if exists
        if (currentRole && currentContent) {
          translatedMessages.push({
            role: currentRole,
            content: currentContent.trim(),
            timestamp:
              conversation[translatedMessages.length]?.timestamp ||
              new Date().toISOString(),
          });
        }
        currentRole = "user";
        currentContent = trimmedLine.substring("RESPONDENT:".length).trim();
      } else if (trimmedLine.startsWith("AI:")) {
        // Save previous message if exists
        if (currentRole && currentContent) {
          translatedMessages.push({
            role: currentRole,
            content: currentContent.trim(),
            timestamp:
              conversation[translatedMessages.length]?.timestamp ||
              new Date().toISOString(),
          });
        }
        currentRole = "assistant";
        currentContent = trimmedLine.substring("AI:".length).trim();
      } else if (trimmedLine && currentRole) {
        // Continuation of current message
        currentContent += " " + trimmedLine;
      }
    }

    // Add the last message
    if (currentRole && currentContent) {
      translatedMessages.push({
        role: currentRole,
        content: currentContent.trim(),
        timestamp:
          conversation[translatedMessages.length]?.timestamp ||
          new Date().toISOString(),
      });
    }

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
    // Fallback: return original conversation
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
    const { getDb } = await import("@/db");
    const { users } = await import("@/db/schema");
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
      case "es":
      case "it":
      case "en":
        return locale;
      default:
        return "en";
    }
  } catch (error) {
    return "en";
  }
}

