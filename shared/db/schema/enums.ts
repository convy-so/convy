import { pgEnum } from "drizzle-orm/pg-core";
import {
  CREATION_CONVERSATION_STATUS_VALUES,
  SURVEY_LANGUAGE_VALUES,
  SURVEY_STATUS_VALUES,
  SURVEY_TONE_VALUES,
  USER_ROLE_VALUES,
  VOICE_CHUNK_TYPE_VALUES,
  VOICE_SESSION_STATUS_VALUES,
  VOICE_SESSION_TYPE_VALUES,
} from "@/shared/surveys/constants";

// Auth & General
export const userRoleEnum = pgEnum("user_role", USER_ROLE_VALUES);
export const languageEnum = pgEnum("language", SURVEY_LANGUAGE_VALUES);

// Surveys
export const surveyStatusEnum = pgEnum("survey_status", SURVEY_STATUS_VALUES);
export const toneEnum = pgEnum("tone", SURVEY_TONE_VALUES);
export const creationConversationStatusEnum = pgEnum(
  "creation_conversation_status",
  CREATION_CONVERSATION_STATUS_VALUES,
);

// Voice
export const voiceSessionStatusEnum = pgEnum(
  "voice_session_status",
  VOICE_SESSION_STATUS_VALUES,
);
export const voiceSessionTypeEnum = pgEnum(
  "voice_session_type",
  VOICE_SESSION_TYPE_VALUES,
);
export const voiceChunkTypeEnum = pgEnum(
  "voice_chunk_type",
  VOICE_CHUNK_TYPE_VALUES,
);
