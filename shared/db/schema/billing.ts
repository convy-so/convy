import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { folders } from "./folders";
import { surveys } from "./surveys";
import { USAGE_LOG_DEFAULTS } from "@/shared/billing/constants";

export { usageLogs, usageLogsRelations };

const usageLogs = pgTable(
  "usage_logs",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    folderId: text("project_id").references(() => folders.id, {
      onDelete: "cascade",
    }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    feature: text("feature"),

    type: text("type").notNull(),
    provider: text("provider").notNull(),
    modelName: text("model_name"),

    promptTokens: integer("prompt_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    completionTokens: integer("completion_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    totalTokens: integer("total_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    inputNoCacheTokens: integer("input_no_cache_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    cacheReadTokens: integer("cache_read_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    cacheWriteTokens: integer("cache_write_tokens").default(USAGE_LOG_DEFAULTS.tokenCount),
    durationMs: integer("duration_ms").default(USAGE_LOG_DEFAULTS.durationMs),

    // Cost
    cost: numeric("cost").default(USAGE_LOG_DEFAULTS.cost).notNull(),
  },
  (table) => [
    index("usage_logs_user_id_idx").on(table.userId),
    index("usage_logs_survey_id_idx").on(table.surveyId),
    index("usage_logs_created_at_idx").on(table.createdAt),
    index("usage_logs_type_idx").on(table.type),
  ],
);

const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [usageLogs.folderId],
    references: [folders.id],
  }),
  survey: one(surveys, {
    fields: [usageLogs.surveyId],
    references: [surveys.id],
  }),
}));
