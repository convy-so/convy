import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "./common";
import { users } from "./auth";

export const expertGuidancePacks = pgTable(
  "expert_guidance_packs",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    artifactType: text("artifact_type").notNull(),
    status: text("status").default("draft").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    targetScope: text("target_scope").default("global").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activeVersionId: text("active_version_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("expert_guidance_packs_feature_idx").on(table.feature),
    index("expert_guidance_packs_type_idx").on(table.artifactType),
    index("expert_guidance_packs_status_idx").on(table.status),
    check(
      "expert_guidance_packs_status_check",
      sql`${table.status} in ('draft', 'approved', 'archived')`,
    ),
  ],
);

export const expertGuidanceVersions = pgTable(
  "expert_guidance_versions",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    packId: text("pack_id")
      .notNull()
      .references(() => expertGuidancePacks.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    status: text("status").default("draft").notNull(),
    artifact: jsonb("artifact").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("expert_guidance_versions_pack_id_idx").on(table.packId),
    unique("expert_guidance_versions_pack_version_unique").on(
      table.packId,
      table.version,
    ),
    check(
      "expert_guidance_versions_status_check",
      sql`${table.status} in ('draft', 'approved', 'archived')`,
    ),
  ],
);

export const fewShotExamples = pgTable(
  "few_shot_examples",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    feature: text("feature").notNull(),
    tags: text("tags").array().default([]),
    userMessage: text("user_message").notNull(),
    assistantMessage: text("assistant_message").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ownedByRole: text("owned_by_role").default("expert").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("few_shot_examples_feature_idx").on(table.feature),
    index("few_shot_examples_active_idx").on(table.isActive),
  ],
);
