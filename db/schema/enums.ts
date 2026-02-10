import { pgEnum } from "drizzle-orm/pg-core";

// Auth & General
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const languageEnum = pgEnum("language", ["en", "fr", "de", "es", "it"]);

// Surveys
export const surveyStatusEnum = pgEnum("survey_status", [
  "draft",
  "creating",
  "sample_review",
  "active",
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
  ["in_progress", "completed", "abandoned"]
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

// Billing
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "pro",
  "premium",
  "enterprise",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "past_due",
  "unpaid",
  "trialing",
  "incomplete",
  "incomplete_expired",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
  "lemonsqueezy",
  "coinbase_business",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "refunded",
  "partially_refunded",
]);
export const paymentCurrencyEnum = pgEnum("payment_currency", [
  "USD",
  "EUR",
  "GBP",
]);
export const cryptoCurrencyEnum = pgEnum("crypto_currency", [
  "USDC",
  "USDT",
  "BTC",
  "ETH",
  "SOL",
]);
