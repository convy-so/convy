import crypto from "crypto";

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import {
  getCachedTranslation,
  setCachedTranslation,
} from "@/shared/i18n/ai-cache";

import {
  appLocaleLabels,
  defaultAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";
import { enqueueContentTranslation } from "@/shared/infra/queue";

export type LocalizedFieldRequest = {
  resourceType: string;
  resourceId: string;
  field: string;
  sourceLocale: AppLocale;
  targetLocale: AppLocale;
  sourceText: string;
  context?: string;
};

export function hashTranslationSource(source: string) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export async function upsertLocalizedField(params: LocalizedFieldRequest & {
  translatedText: string;
  provider?: string;
}) {
  await setCachedTranslation(
    params.sourceText,
    params.targetLocale,
    params.translatedText,
  );

  return {
    id: `${params.resourceType}:${params.resourceId}:${params.field}:${params.targetLocale}`,
    sourceHash: hashTranslationSource(params.sourceText),
    translatedText: params.translatedText,
    provider: params.provider ?? "gemini-2.5-flash-lite",
    status: "ready" as const,
    context: params.context ?? null,
  };
}

export async function getStoredLocalizedField(
  params: LocalizedFieldRequest,
): Promise<string | null> {
  if (params.targetLocale === params.sourceLocale) {
    return params.sourceText;
  }

  return getCachedTranslation(params.sourceText, params.targetLocale);
}

export async function queueLocalizedField(params: LocalizedFieldRequest) {
  if (
    params.targetLocale === params.sourceLocale ||
    params.targetLocale === defaultAppLocale ||
    params.sourceText.trim().length === 0
  ) {
    return;
  }

  await enqueueContentTranslation({
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    field: params.field,
    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,
    sourceText: params.sourceText,
    context: params.context,
  });
}

export async function translateDynamicField(
  params: LocalizedFieldRequest,
): Promise<string> {
  if (
    params.targetLocale === params.sourceLocale ||
    params.sourceText.trim().length === 0
  ) {
    return params.sourceText;
  }

  const cached = await getCachedTranslation(
    params.sourceText,
    params.targetLocale,
  );
  if (cached) {
    return cached;
  }

  const { text } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    temperature: 0,
    prompt: `Translate the following application content from ${appLocaleLabels[params.sourceLocale]} to ${appLocaleLabels[params.targetLocale]}.

Context:
${params.context ?? "General product content"}

Rules:
- Preserve intent and product meaning.
- Keep placeholders, identifiers, and quoted code unchanged.
- Return only the translated text.

Source text:
${params.sourceText}`,
  });

  const translated = text.trim();
  await setCachedTranslation(
    params.sourceText,
    params.targetLocale,
    translated,
  );
  return translated;
}

export async function getLocalizedFieldOrQueue(
  params: LocalizedFieldRequest,
): Promise<string> {
  if (
    params.targetLocale === params.sourceLocale ||
    params.sourceText.trim().length === 0
  ) {
    return params.sourceText;
  }

  await queueLocalizedField(params);
  return params.sourceText;
}
