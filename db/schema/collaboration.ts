import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { timestamps } from "./common";
import { users } from "./auth";
import { surveys } from "./surveys";

export const surveyEditLeases = pgTable(
  "survey_edit_leases",
  {
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    holderUserId: text("holder_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    holderSessionId: text("holder_session_id"),
    leaseToken: text("lease_token").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.surveyId, table.stage] }),
    index("survey_edit_leases_holder_user_id_idx").on(table.holderUserId),
    index("survey_edit_leases_expires_at_idx").on(table.expiresAt),
  ],
);

export const surveyRevisions = pgTable("survey_revisions", {
  surveyId: text("survey_id")
    .primaryKey()
    .references(() => surveys.id, { onDelete: "cascade" }),
  revision: integer("revision").default(0).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const surveyEditLeasesRelations = relations(
  surveyEditLeases,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyEditLeases.surveyId],
      references: [surveys.id],
    }),
    holder: one(users, {
      fields: [surveyEditLeases.holderUserId],
      references: [users.id],
    }),
  }),
);

export const surveyRevisionsRelations = relations(
  surveyRevisions,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyRevisions.surveyId],
      references: [surveys.id],
    }),
  }),
);
