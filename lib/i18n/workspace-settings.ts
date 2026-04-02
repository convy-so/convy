import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { workspaceLocalizationSettings } from "@/db/schema";
import {
  appLocales,
  defaultWorkspaceLocaleSettings,
  isAppLocale,
  type AppLocale,
  type WorkspaceLocaleSettings,
} from "@/lib/i18n/config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAllowedLocales(value: unknown): AppLocale[] {
  if (!Array.isArray(value)) {
    return [...appLocales];
  }

  const locales = value.filter(isAppLocale);
  return locales.length > 0 ? Array.from(new Set(locales)) : [...appLocales];
}

export function normalizeWorkspaceLocaleSettings(
  value: unknown,
): WorkspaceLocaleSettings {
  if (!isRecord(value)) {
    return { ...defaultWorkspaceLocaleSettings };
  }

  return {
    defaultUiLocale: isAppLocale(value.defaultUiLocale)
      ? value.defaultUiLocale
      : defaultWorkspaceLocaleSettings.defaultUiLocale,
    defaultContentLocale: isAppLocale(value.defaultContentLocale)
      ? value.defaultContentLocale
      : defaultWorkspaceLocaleSettings.defaultContentLocale,
    emailLocale: isAppLocale(value.emailLocale)
      ? value.emailLocale
      : defaultWorkspaceLocaleSettings.emailLocale,
    allowedLocales: normalizeAllowedLocales(value.allowedLocales),
    autoTranslateGeneratedContent:
      typeof value.autoTranslateGeneratedContent === "boolean"
        ? value.autoTranslateGeneratedContent
        : defaultWorkspaceLocaleSettings.autoTranslateGeneratedContent,
  };
}

export async function getWorkspaceLocaleSettings(
  organizationId: string | null | undefined,
): Promise<WorkspaceLocaleSettings | null> {
  if (!organizationId) {
    return null;
  }

  const record = await getDb().query.workspaceLocalizationSettings.findFirst({
    where: eq(workspaceLocalizationSettings.organizationId, organizationId),
  });

  if (!record) {
    return { ...defaultWorkspaceLocaleSettings };
  }

  return normalizeWorkspaceLocaleSettings(record.settings);
}

export async function upsertWorkspaceLocaleSettings(params: {
  organizationId: string;
  settings: WorkspaceLocaleSettings;
}) {
  const existing = await getDb().query.workspaceLocalizationSettings.findFirst({
    where: eq(workspaceLocalizationSettings.organizationId, params.organizationId),
  });

  if (existing) {
    const [updated] = await getDb()
      .update(workspaceLocalizationSettings)
      .set({
        settings: params.settings,
        updatedAt: new Date(),
      })
      .where(eq(workspaceLocalizationSettings.organizationId, params.organizationId))
      .returning();

    return updated;
  }

  const [created] = await getDb()
    .insert(workspaceLocalizationSettings)
    .values({
      id: params.organizationId,
      organizationId: params.organizationId,
      settings: params.settings,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function ensureWorkspaceLocaleSettings(organizationId: string) {
  const existing = await getDb().query.workspaceLocalizationSettings.findFirst({
    where: eq(workspaceLocalizationSettings.organizationId, organizationId),
  });

  if (existing) {
    return existing;
  }

  return await upsertWorkspaceLocaleSettings({
    organizationId,
    settings: { ...defaultWorkspaceLocaleSettings },
  });
}
