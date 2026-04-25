import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import {
  voiceSessionStatusEnum,
  voiceSessionTypeEnum,
} from "./enums";
import { users } from "./auth";
import { surveys } from "./surveys";

export {
  voiceSessions,
  voiceSessionsRelations,
};

const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    conversationId: text("conversation_id"),
    sessionType: voiceSessionTypeEnum("session_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms").default(0),
    audioDurationMs: integer("audio_duration_ms").default(0),
    totalCost: numeric("total_cost").default("0"),
    sttCost: numeric("stt_cost").default("0"),
    ttsCost: numeric("tts_cost").default("0"),
    status: voiceSessionStatusEnum("status").default("active"),
    ...timestamps,
  },
  (table) => [
    index("voice_sessions_user_id_idx").on(table.userId),
    index("voice_sessions_survey_id_idx").on(table.surveyId),
    index("voice_sessions_started_at_idx").on(table.startedAt),
  ]
);

const voiceSessionsRelations = relations(
  voiceSessions,
  ({ one }) => ({
    user: one(users, {
      fields: [voiceSessions.userId],
      references: [users.id],
    }),
    survey: one(surveys, {
      fields: [voiceSessions.surveyId],
      references: [surveys.id],
    }),
  })
);
