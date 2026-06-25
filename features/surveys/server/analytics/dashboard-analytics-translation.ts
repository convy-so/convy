import crypto from "crypto";

import type { AppLocale } from "@/shared/i18n/config";
import { getCachedTranslation } from "@/shared/i18n/ai-cache";
import { enqueueContentTranslation } from "@/shared/infra/queue";

function hashAnalyticsText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function translateFromCacheOrQueue(params: {
  texts: string[];
  targetLanguage: AppLocale;
  resourceType: string;
  resourceId: string;
  sourceLocale?: AppLocale;
  context: string;
}) {
  if (params.targetLanguage === "en") {
    return params.texts;
  }

  const cachedByText = new Map<string, string>();

  await Promise.all(
    Array.from(new Set(params.texts.map((text) => text.trim()).filter(Boolean))).map(
      async (text) => {
        const cached = await getCachedTranslation(text, params.targetLanguage);
        if (cached) {
          cachedByText.set(text, cached);
          return;
        }

        await enqueueContentTranslation({
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          field: hashAnalyticsText(text),
          sourceLocale: params.sourceLocale ?? "en",
          targetLocale: params.targetLanguage,
          sourceText: text,
          context: params.context,
        }).catch(() => undefined);
      },
    ),
  );

  return params.texts.map((text) => cachedByText.get(text.trim()) ?? text);
}
