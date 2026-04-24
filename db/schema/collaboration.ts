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

export const surveyRealtimeEvents = pgTable(
  "survey_realtime_events",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, {
        onDelete: "cascade",
      }),
    revision: integer("revision").notNull(),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("survey_realtime_events_survey_idx").on(table.surveyId, table.revision),
    index("survey_realtime_events_type_idx").on(table.eventType),
  ],
);

export const surveyOutbox = pgTable(
  "survey_outbox",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, {
        onDelete: "cascade",
      }),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    claimOwner: text("claim_owner"),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    claimExpiresAt: timestamp("claim_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishAttempts: integer("publish_attempts").default(0).notNull(),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("survey_outbox_survey_idx").on(table.surveyId, table.publishedAt),
    index("survey_outbox_unpublished_created_idx").on(
      table.publishedAt,
      table.createdAt,
    ),
    index("survey_outbox_reclaim_idx").on(
      table.publishedAt,
      table.claimExpiresAt,
      table.createdAt,
    ),
  ],
);

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

export const surveyRealtimeEventsRelations = relations(
  surveyRealtimeEvents,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [surveyRealtimeEvents.surveyId],
      references: [surveys.id],
    }),
    actor: one(users, {
      fields: [surveyRealtimeEvents.actorId],
      references: [users.id],
    }),
  }),
);

export const surveyOutboxRelations = relations(surveyOutbox, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyOutbox.surveyId],
    references: [surveys.id],
  }),
}));
