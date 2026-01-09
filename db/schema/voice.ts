import {
  boolean,
  index,
  integer,
  jsonb,
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
  voiceChunkTypeEnum,
} from "./enums";
import { users } from "./auth";
import { surveys } from "./surveys";

// Re-export
export {
  voiceSessions,
  voiceChunks,
  voiceQualityMetrics,
  voiceSessionsRelations,
  voiceChunksRelations,
  voiceQualityMetricsRelations,
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

const voiceChunks = pgTable(
  "voice_chunks",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => voiceSessions.id, { onDelete: "cascade" }),
    chunkType: voiceChunkTypeEnum("chunk_type").notNull(),
    durationMs: integer("duration_ms").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    transcription: text("transcription"),
    synthesisText: text("synthesis_text"),
    cost: numeric("cost").default("0"),
    hadSpeech: boolean("had_speech").default(true),
    vadProbability: text("vad_probability"),
    processingTimeMs: integer("processing_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("voice_chunks_session_id_idx").on(table.sessionId)]
);

const voiceQualityMetrics = pgTable(
  "voice_quality_metrics",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => voiceSessions.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    metricValue: text("metric_value").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("voice_quality_metrics_session_id_idx").on(table.sessionId)]
);

const voiceSessionsRelations = relations(
  voiceSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [voiceSessions.userId],
      references: [users.id],
    }),
    survey: one(surveys, {
      fields: [voiceSessions.surveyId],
      references: [surveys.id],
    }),
    chunks: many(voiceChunks),
    metrics: many(voiceQualityMetrics),
  })
);

const voiceChunksRelations = relations(voiceChunks, ({ one }) => ({
  session: one(voiceSessions, {
    fields: [voiceChunks.sessionId],
    references: [voiceSessions.id],
  }),
}));

const voiceQualityMetricsRelations = relations(
  voiceQualityMetrics,
  ({ one }) => ({
    session: one(voiceSessions, {
      fields: [voiceQualityMetrics.sessionId],
      references: [voiceSessions.id],
    }),
  })
);
