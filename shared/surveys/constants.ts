export const USER_ROLE_VALUES = [
  "student",
  "teacher",
  "expert",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];

export const USER_ROLE = {
  STUDENT: USER_ROLE_VALUES[0],
  TEACHER: USER_ROLE_VALUES[1],
  EXPERT: USER_ROLE_VALUES[2],
  ADMIN: USER_ROLE_VALUES[3],
} as const;

export const SURVEY_LANGUAGE_VALUES = ["en", "fr", "de", "es", "it"] as const;

export type SurveyLanguage = (typeof SURVEY_LANGUAGE_VALUES)[number];

export const SURVEY_LANGUAGE = {
  ENGLISH: SURVEY_LANGUAGE_VALUES[0],
  FRENCH: SURVEY_LANGUAGE_VALUES[1],
  GERMAN: SURVEY_LANGUAGE_VALUES[2],
  SPANISH: SURVEY_LANGUAGE_VALUES[3],
  ITALIAN: SURVEY_LANGUAGE_VALUES[4],
} as const;

export const SURVEY_STATUS_VALUES = [
  "draft",
  "creating",
  "sample_review",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type SurveyStatus = (typeof SURVEY_STATUS_VALUES)[number];

export const SURVEY_STATUS = {
  DRAFT: SURVEY_STATUS_VALUES[0],
  CREATING: SURVEY_STATUS_VALUES[1],
  SAMPLE_REVIEW: SURVEY_STATUS_VALUES[2],
  ACTIVE: SURVEY_STATUS_VALUES[3],
  PAUSED: SURVEY_STATUS_VALUES[4],
  COMPLETED: SURVEY_STATUS_VALUES[5],
  ARCHIVED: SURVEY_STATUS_VALUES[6],
} as const;

export const SURVEY_DELIVERY_MODE_VALUES = [
  "link",
  "classroom_assigned",
] as const;

export type SurveyDeliveryMode = (typeof SURVEY_DELIVERY_MODE_VALUES)[number];

export const SURVEY_DELIVERY_MODE = {
  LINK: SURVEY_DELIVERY_MODE_VALUES[0],
  CLASSROOM_ASSIGNED: SURVEY_DELIVERY_MODE_VALUES[1],
} as const;

export const SURVEY_TONE_VALUES = [
  "formal",
  "casual",
  "playful",
  "empathetic",
] as const;

export type SurveyTone = (typeof SURVEY_TONE_VALUES)[number];

export const SURVEY_TONE = {
  FORMAL: SURVEY_TONE_VALUES[0],
  CASUAL: SURVEY_TONE_VALUES[1],
  PLAYFUL: SURVEY_TONE_VALUES[2],
  EMPATHETIC: SURVEY_TONE_VALUES[3],
} as const;

export const CREATION_CONVERSATION_STATUS_VALUES = [
  "in_progress",
  "completed",
  "abandoned",
] as const;

export type CreationConversationStatus =
  (typeof CREATION_CONVERSATION_STATUS_VALUES)[number];

export const CREATION_CONVERSATION_STATUS = {
  IN_PROGRESS: CREATION_CONVERSATION_STATUS_VALUES[0],
  COMPLETED: CREATION_CONVERSATION_STATUS_VALUES[1],
  ABANDONED: CREATION_CONVERSATION_STATUS_VALUES[2],
} as const;

export const VOICE_SESSION_STATUS_VALUES = [
  "active",
  "completed",
  "abandoned",
  "error",
] as const;

export type VoiceSessionStatus = (typeof VOICE_SESSION_STATUS_VALUES)[number];

export const VOICE_SESSION_STATUS = {
  ACTIVE: VOICE_SESSION_STATUS_VALUES[0],
  COMPLETED: VOICE_SESSION_STATUS_VALUES[1],
  ABANDONED: VOICE_SESSION_STATUS_VALUES[2],
  ERROR: VOICE_SESSION_STATUS_VALUES[3],
} as const;

export const VOICE_SESSION_TYPE_VALUES = [
  "survey_creation",
  "survey_response",
  "sample_conversation",
] as const;

export type VoiceSessionType = (typeof VOICE_SESSION_TYPE_VALUES)[number];

export const VOICE_SESSION_TYPE = {
  SURVEY_CREATION: VOICE_SESSION_TYPE_VALUES[0],
  SURVEY_RESPONSE: VOICE_SESSION_TYPE_VALUES[1],
  SAMPLE_CONVERSATION: VOICE_SESSION_TYPE_VALUES[2],
} as const;

export const VOICE_CHUNK_TYPE_VALUES = ["audio_in", "audio_out"] as const;

export type VoiceChunkType = (typeof VOICE_CHUNK_TYPE_VALUES)[number];

export const VOICE_CHUNK_TYPE = {
  AUDIO_IN: VOICE_CHUNK_TYPE_VALUES[0],
  AUDIO_OUT: VOICE_CHUNK_TYPE_VALUES[1],
} as const;

export const SURVEY_SESSION_TYPE_VALUES = ["sample", "live"] as const;

export type SurveySessionType = (typeof SURVEY_SESSION_TYPE_VALUES)[number];

export const SURVEY_SESSION_TYPE = {
  SAMPLE: SURVEY_SESSION_TYPE_VALUES[0],
  LIVE: SURVEY_SESSION_TYPE_VALUES[1],
} as const;

export const SURVEY_SESSION_STATUS_VALUES = [
  "active",
  "completed",
  "paused",
  "flagged",
] as const;

export type SurveySessionStatus =
  (typeof SURVEY_SESSION_STATUS_VALUES)[number];

export const SURVEY_SESSION_STATUS = {
  ACTIVE: SURVEY_SESSION_STATUS_VALUES[0],
  COMPLETED: SURVEY_SESSION_STATUS_VALUES[1],
  PAUSED: SURVEY_SESSION_STATUS_VALUES[2],
  FLAGGED: SURVEY_SESSION_STATUS_VALUES[3],
} as const;

export const SURVEY_SENTIMENT_VALUES = [
  "positive",
  "negative",
  "neutral",
  "mixed",
] as const;

export type SurveySentiment = (typeof SURVEY_SENTIMENT_VALUES)[number];

export const SURVEY_SENTIMENT = {
  POSITIVE: SURVEY_SENTIMENT_VALUES[0],
  NEGATIVE: SURVEY_SENTIMENT_VALUES[1],
  NEUTRAL: SURVEY_SENTIMENT_VALUES[2],
  MIXED: SURVEY_SENTIMENT_VALUES[3],
} as const;

export const SURVEY_ANALYTICS_TRIGGER_VALUES = [
  "automatic",
  "manual",
] as const;

export type SurveyAnalyticsTrigger =
  (typeof SURVEY_ANALYTICS_TRIGGER_VALUES)[number];

export const SURVEY_ANALYTICS_TRIGGER = {
  AUTOMATIC: SURVEY_ANALYTICS_TRIGGER_VALUES[0],
  MANUAL: SURVEY_ANALYTICS_TRIGGER_VALUES[1],
} as const;

export const SURVEY_ANALYTICS_STATE_VALUES = [
  "idle",
  "queued",
  "running",
  "failed",
] as const;

export type SurveyAnalyticsState =
  (typeof SURVEY_ANALYTICS_STATE_VALUES)[number];

export const SURVEY_ANALYTICS_STATE = {
  IDLE: SURVEY_ANALYTICS_STATE_VALUES[0],
  QUEUED: SURVEY_ANALYTICS_STATE_VALUES[1],
  RUNNING: SURVEY_ANALYTICS_STATE_VALUES[2],
  FAILED: SURVEY_ANALYTICS_STATE_VALUES[3],
} as const;

export const CREATION_CONTROLLER_ACTION_VALUES = [
  "ask",
  "clarify",
  "confirm",
  "complete",
] as const;

export type CreationControllerAction =
  (typeof CREATION_CONTROLLER_ACTION_VALUES)[number];

export const CREATION_FIELD_QUALITY_STATUS_VALUES = [
  "missing",
  "thin",
  "sufficient",
  "conflicting",
] as const;

export type CreationFieldQualityStatus =
  (typeof CREATION_FIELD_QUALITY_STATUS_VALUES)[number];

export const SURVEY_DEFAULTS = {
  deliveryMode: SURVEY_DELIVERY_MODE.LINK,
  status: SURVEY_STATUS.CREATING,
  tone: SURVEY_TONE.CASUAL,
  language: SURVEY_LANGUAGE.ENGLISH,
  participantLimit: 50,
  currentParticipants: 0,
  sampleConversationCount: 0,
  durationMs: 0,
  activeDurationMs: 0,
  initialVersion: 1,
  confirmed: false,
  isVoice: false,
  evidenceReliabilityPercent: 70,
  participantFeedbackMinRating: 1,
  participantFeedbackMaxRating: 5,
  analyticsChatTitle: "New Chat",
  lastProcessedResponseCount: 0,
} as const;

export const SURVEY_LIMITS = {
  maxParticipantLimit: 50,
  maxConversationDurationMinutes: 30,
} as const;

const surveyToneSet = new Set<string>(SURVEY_TONE_VALUES);
const surveyLanguageSet = new Set<string>(SURVEY_LANGUAGE_VALUES);
const surveyStatusSet = new Set<string>(SURVEY_STATUS_VALUES);
const surveyDeliveryModeSet = new Set<string>(SURVEY_DELIVERY_MODE_VALUES);

export function isSurveyTone(value: unknown): value is SurveyTone {
  return typeof value === "string" && surveyToneSet.has(value);
}

export function normalizeSurveyTone(
  value: unknown,
  fallback: SurveyTone = SURVEY_DEFAULTS.tone,
): SurveyTone {
  return isSurveyTone(value) ? value : fallback;
}

export function isSurveyLanguage(value: unknown): value is SurveyLanguage {
  return typeof value === "string" && surveyLanguageSet.has(value);
}

export function normalizeSurveyLanguage(
  value: unknown,
  fallback: SurveyLanguage = SURVEY_DEFAULTS.language,
): SurveyLanguage {
  return isSurveyLanguage(value) ? value : fallback;
}

export function isSurveyStatus(value: unknown): value is SurveyStatus {
  return typeof value === "string" && surveyStatusSet.has(value);
}

export function normalizeSurveyStatus(
  value: unknown,
  fallback: SurveyStatus = SURVEY_STATUS.DRAFT,
): SurveyStatus {
  return isSurveyStatus(value) ? value : fallback;
}

export function isSurveyDeliveryMode(
  value: unknown,
): value is SurveyDeliveryMode {
  return typeof value === "string" && surveyDeliveryModeSet.has(value);
}

export function normalizeSurveyDeliveryMode(
  value: unknown,
  fallback: SurveyDeliveryMode = SURVEY_DEFAULTS.deliveryMode,
): SurveyDeliveryMode {
  return isSurveyDeliveryMode(value) ? value : fallback;
}
