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
import { organizations, projects } from "./organization";
import { surveys } from "./surveys";

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
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),

    type: text("type").notNull(),
    provider: text("provider").notNull(),
    modelName: text("model_name"),

    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    inputNoCacheTokens: integer("input_no_cache_tokens").default(0),
    cacheReadTokens: integer("cache_read_tokens").default(0),
    cacheWriteTokens: integer("cache_write_tokens").default(0),
    durationMs: integer("duration_ms").default(0),

    // Cost
    cost: numeric("cost").default("0").notNull(),
  },
  (table) => [
    index("usage_logs_user_id_idx").on(table.userId),
    index("usage_logs_organization_id_idx").on(table.organizationId),
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
  organization: one(organizations, {
    fields: [usageLogs.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [usageLogs.projectId],
    references: [projects.id],
  }),
  survey: one(surveys, {
    fields: [usageLogs.surveyId],
    references: [surveys.id],
  }),
}));
