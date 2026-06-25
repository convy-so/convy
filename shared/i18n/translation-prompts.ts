import { appLocaleLabels, type AppLocale } from "@/shared/i18n/config";

type TranslationPromptMetadata = {
  task?: string;
};

/**
 * Batch translation prompt.
 * Input: list of strings and target locale.
 * Output: strict JSON object with `items: string[]` in the same order.
 * Fallback instruction: if translation is uncertain, keep meaning conservative and do not invent details.
 */
export function buildBatchTranslationPrompt(
  items: readonly string[],
  targetLanguage: AppLocale,
  metadata?: TranslationPromptMetadata,
): string {
  return `You are a professional translator. Translate each item into ${appLocaleLabels[targetLanguage]}.

CRITICAL INSTRUCTIONS:
1. Return valid JSON only.
2. Keep array order exactly the same.
3. Preserve tone, meaning, and specificity.
4. If an item is already in the target language, keep it natural and unchanged unless a clearer translation is required.
5. If meaning is ambiguous, choose the safest literal phrasing and do not invent information.
6. Do not add explanations.

Return this schema exactly:
{"items":["translated string 1","translated string 2"]}

Task context: ${metadata?.task ?? "product UI content"}

Items:
${JSON.stringify(items, null, 2)}`;
}

/**
 * Conversation translation prompt.
 * Input: structured lines with RESPONDENT/AI prefixes and source/target locales.
 * Output: plain text conversation with identical line-prefix format.
 * Fallback instruction: if a line is ambiguous, keep it semantically conservative and preserve role prefixes.
 */
export function buildConversationTranslationPrompt(input: {
  sourceLanguage: AppLocale;
  targetLanguage: AppLocale;
  conversationText: string;
}): string {
  return `You are a professional translator. Translate the following survey conversation from ${appLocaleLabels[input.sourceLanguage]} to ${appLocaleLabels[input.targetLanguage]}.

CRITICAL INSTRUCTIONS:
1. Maintain the exact structure: each line should start with either "RESPONDENT:" or "AI:"
2. Translate the content accurately while preserving meaning, tone, and context.
3. Keep the conversation natural in the target language.
4. If any line is ambiguous, preserve conservative meaning and keep the original role prefix.
5. Do NOT add commentary or explanations.
6. Output ONLY the translated conversation in the exact same format.

Original Conversation (${appLocaleLabels[input.sourceLanguage]}):
---
${input.conversationText}
---

Translated Conversation (${appLocaleLabels[input.targetLanguage]}):`;
}
