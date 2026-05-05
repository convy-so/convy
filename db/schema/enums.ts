import { pgEnum } from "drizzle-orm/pg-core";

// Auth & General
export const userRoleEnum = pgEnum("user_role", ["student", "teacher", "expert", "admin"]);
export const languageEnum = pgEnum("language", ["en", "fr", "de", "es", "it"]);

// Surveys
export const surveyStatusEnum = pgEnum("survey_status", [
  "draft",
  "creating",
  "sample_review",
  "active",
  "paused",
  "completed",
  "archived",
]);
export const toneEnum = pgEnum("tone", [
  "formal",
  "casual",
  "playful",
  "empathetic",
]);
export const creationConversationStatusEnum = pgEnum(
  "creation_conversation_status",
  ["in_progress", "completed", "abandoned"],
);

// Voice
export const voiceSessionStatusEnum = pgEnum("voice_session_status", [
  "active",
  "completed",
  "abandoned",
  "error",
]);
export const voiceSessionTypeEnum = pgEnum("voice_session_type", [
  "survey_creation",
  "survey_response",
  "sample_conversation",
]);
export const voiceChunkTypeEnum = pgEnum("voice_chunk_type", [
  "audio_in",
  "audio_out",
]);
