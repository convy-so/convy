import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { timestamps } from "./common";
import { organizations } from "./organization";
import type { WorkspaceLocaleSettings } from "@/lib/i18n/config";

export const workspaceLocalizationSettings = pgTable(
  "workspace_localization_settings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" })
      .unique(),
    settings: jsonb("settings").$type<WorkspaceLocaleSettings>().notNull(),
  },
  (table) => [index("workspace_localization_settings_org_idx").on(table.organizationId)],
);

export const localizedContent = pgTable(
  "localized_content",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    field: text("field").notNull(),
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    sourceHash: text("source_hash").notNull(),
    translatedText: text("translated_text").notNull(),
    status: text("status").default("ready").notNull(),
    provider: text("provider").notNull(),
    context: text("context"),
  },
  (table) => [
    index("localized_content_resource_idx").on(
      table.resourceType,
      table.resourceId,
      table.field,
    ),
    index("localized_content_target_idx").on(table.targetLocale),
    unique("localized_content_unique_version").on(
      table.resourceType,
      table.resourceId,
      table.field,
      table.targetLocale,
      table.sourceHash,
    ),
  ],
);

export const translationGlossaryTerms = pgTable(
  "translation_glossary_terms",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    termKey: text("term_key").notNull(),
    sourceTerm: text("source_term").notNull(),
    locale: text("locale").notNull(),
    translatedTerm: text("translated_term").notNull(),
    doNotTranslate: boolean("do_not_translate").default(false).notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("translation_glossary_terms_term_key_idx").on(table.termKey),
    index("translation_glossary_terms_locale_idx").on(table.locale),
    unique("translation_glossary_terms_unique").on(table.termKey, table.locale),
  ],
);

export const workspaceLocalizationSettingsRelations = relations(
  workspaceLocalizationSettings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [workspaceLocalizationSettings.organizationId],
      references: [organizations.id],
    }),
  }),
);

