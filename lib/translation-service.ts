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
      console.warn(
        `Translation message count mismatch: expected ${conversation.length}, got ${translatedMessages.length}. Falling back to original.`,
      );
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
    console.error("[Translation Service] Translation failed:", error);
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
    console.error("[Translation Service] Failed to get user language:", error);
    return "en";
  }
}
