import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { getDb } from "@/db";
import { localizedContent, translationGlossaryTerms } from "@/db/schema";
import {
  appLocaleLabels,
  defaultAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import { enqueueContentTranslation } from "@/lib/queue";

export type LocalizedFieldRequest = {
  resourceType: string;
  resourceId: string;
  field: string;
  sourceLocale: AppLocale;
  targetLocale: AppLocale;
  sourceText: string;
  context?: string;
};

type GlossaryEntry = {
  termKey: string;
  sourceTerm: string;
  translatedTerm: string;
  doNotTranslate: boolean;
  notes: string | null;
};

export function hashTranslationSource(source: string) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

async function getGlossaryEntries(targetLocale: AppLocale): Promise<GlossaryEntry[]> {
  return await getDb().query.translationGlossaryTerms.findMany({
    where: eq(translationGlossaryTerms.locale, targetLocale),
    orderBy: (table, { asc }) => [asc(table.termKey)],
  });
}

function buildGlossaryPrompt(entries: GlossaryEntry[]) {
  if (entries.length === 0) {
    return "No glossary overrides.";
  }

  return entries
    .map((entry) => {
      const mode = entry.doNotTranslate ? "KEEP SOURCE TERM" : entry.translatedTerm;
      return `- ${entry.sourceTerm} => ${mode}${entry.notes ? ` (${entry.notes})` : ""}`;
    })
    .join("\n");
}

export async function upsertLocalizedField(params: LocalizedFieldRequest & {
  translatedText: string;
  provider?: string;
}) {
  const sourceHash = hashTranslationSource(params.sourceText);
  const existing = await getDb().query.localizedContent.findFirst({
    where: and(
      eq(localizedContent.resourceType, params.resourceType),
      eq(localizedContent.resourceId, params.resourceId),
      eq(localizedContent.field, params.field),
      eq(localizedContent.targetLocale, params.targetLocale),
      eq(localizedContent.sourceHash, sourceHash),
    ),
  });

  if (existing) {
    const [updated] = await getDb()
      .update(localizedContent)
      .set({
        translatedText: params.translatedText,
        status: "ready",
        provider: params.provider ?? "gemini-2.5-flash-lite",
        context: params.context ?? null,
        updatedAt: new Date(),
      })
      .where(eq(localizedContent.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await getDb()
    .insert(localizedContent)
    .values({
      id: nanoid(),
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      field: params.field,
      sourceLocale: params.sourceLocale,
      targetLocale: params.targetLocale,
      sourceHash,
      translatedText: params.translatedText,
      status: "ready",
      provider: params.provider ?? "gemini-2.5-flash-lite",
      context: params.context ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function getStoredLocalizedField(
  params: LocalizedFieldRequest,
): Promise<string | null> {
  if (params.targetLocale === params.sourceLocale) {
    return params.sourceText;
  }

  const sourceHash = hashTranslationSource(params.sourceText);
  const existing = await getDb().query.localizedContent.findFirst({
    where: and(
      eq(localizedContent.resourceType, params.resourceType),
      eq(localizedContent.resourceId, params.resourceId),
      eq(localizedContent.field, params.field),
      eq(localizedContent.targetLocale, params.targetLocale),
      eq(localizedContent.sourceHash, sourceHash),
      eq(localizedContent.status, "ready"),
    ),
  });

  return existing?.translatedText ?? null;
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

  const cached = await getStoredLocalizedField(params);
  if (cached) {
    return cached;
  }

  const glossaryEntries = await getGlossaryEntries(params.targetLocale);
  const { text } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    temperature: 0,
    prompt: `Translate the following application content from ${appLocaleLabels[params.sourceLocale]} to ${appLocaleLabels[params.targetLocale]}.

Context:
${params.context ?? "General product content"}

Glossary:
${buildGlossaryPrompt(glossaryEntries)}

Rules:
- Preserve intent and product meaning.
- Keep placeholders, identifiers, and quoted code unchanged.
- Respect glossary entries exactly.
- Return only the translated text.

Source text:
${params.sourceText}`,
  });

  const translatedText = text.trim();
  await upsertLocalizedField({
    ...params,
    translatedText,
  });

  return translatedText;
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

  const cached = await getStoredLocalizedField(params);
  if (cached) {
    return cached;
  }

  await queueLocalizedField(params);
  return params.sourceText;
}

