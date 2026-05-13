 const required = (key: string): string => {
  const value = process.env[key];

  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const optional = (key: string): string | undefined => {
  return process.env[key];
};

const optionalBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = optional(key);
  if (value === undefined) {
    return defaultValue;
  }
  return value === "true";
};

const optionalInt = (key: string, defaultValue: number): number => {
  const value = optional(key);
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer environment variable: ${key}`);
  }

  return parsed;
};

const appBaseUrl = optional("APP_BASE_URL") || "http://localhost:3000";
const betterAuthUrl = optional("BETTER_AUTH_URL") || appBaseUrl;
const allowInsecureTls = optional("ALLOW_INSECURE_TLS") === "true";
const outboxNotifyChannel =
  optional("OUTBOX_NOTIFY_CHANNEL") || "survey_outbox_wakeup";

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(outboxNotifyChannel)) {
  throw new Error("Invalid OUTBOX_NOTIFY_CHANNEL; expected a PostgreSQL identifier");
}

const voiceAgentInternalKey =
  optional("VOICE_AGENT_INTERNAL_KEY") ||
  (process.env.NODE_ENV === "production"
    ? required("VOICE_AGENT_INTERNAL_KEY")
    : "dev-internal-key");

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: required("DATABASE_URL"),
  DATABASE_DIRECT_URL: optional("DATABASE_DIRECT_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: betterAuthUrl,
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),
  RESEND_API_KEY: required("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: required("RESEND_FROM_EMAIL"),
  GOOGLE_GENERATIVE_AI_API_KEY: required("GOOGLE_GENERATIVE_AI_API_KEY"),
  UPSTASH_REDIS_URL: optional("UPSTASH_REDIS_URL"),
  REDIS_URL: optional("REDIS_URL") || "redis://localhost:6379",
  UPSTASH_REDIS_REST_URL: required("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: required("UPSTASH_REDIS_REST_TOKEN"),
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ),
  convy_supabase_secret_key: required("convy_supabase_secret_key"),

  // Encryption for tokens
  ENCRYPTION_KEY: optional("ENCRYPTION_KEY"),
  ALLOW_INSECURE_TLS: allowInsecureTls,

  // Voice/WebSocket Configuration
  WEBSOCKET_PORT: optional("WEBSOCKET_PORT") || "3001",
  DEEPGRAM_API_KEY: optional("DEEPGRAM_API_KEY"),
  VOICE_STT_PROVIDER: optional("VOICE_STT_PROVIDER"),
  VOICE_AGENT_PROVIDER: optional("VOICE_AGENT_PROVIDER"),
  /** Shared secret used to authenticate Deepgram → our /api/voice/agent-turn endpoint */
  VOICE_AGENT_INTERNAL_KEY: voiceAgentInternalKey,

  // Application base URL (for public links & embeds), e.g. https://app.convy.com
  APP_BASE_URL: appBaseUrl,
  betterAuthUrl,

  // Better Auth Client URL (for frontend)
  NEXT_PUBLIC_BETTER_AUTH_URL:
    optional("NEXT_PUBLIC_BETTER_AUTH_URL") || betterAuthUrl,

  NEXT_PUBLIC_WEBSOCKET_URL:
    optional("NEXT_PUBLIC_WEBSOCKET_URL") || "ws://localhost:3001",
  OUTBOX_NOTIFY_CHANNEL: outboxNotifyChannel,
  OUTBOX_RELAY_ENABLED: optionalBoolean("OUTBOX_RELAY_ENABLED", false),
  OUTBOX_CLAIM_TTL_MS: optionalInt("OUTBOX_CLAIM_TTL_MS", 30_000),
  OUTBOX_SWEEP_INTERVAL_MS: optionalInt("OUTBOX_SWEEP_INTERVAL_MS", 5_000),
  OUTBOX_BATCH_SIZE: optionalInt("OUTBOX_BATCH_SIZE", 100),
  GDPR_EU_MODE: optional("GDPR_EU_MODE") === "true",
  GDPR_PRIVACY_SECRET: optional("GDPR_PRIVACY_SECRET"),
  GDPR_EU_APPROVED_PROCESSORS: optional("GDPR_EU_APPROVED_PROCESSORS")
    ? optional("GDPR_EU_APPROVED_PROCESSORS")!
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [],

  ADMIN_EMAILS: optional("ADMIN_EMAILS")
    ? optional("ADMIN_EMAILS")!
        .split(",")
        .map((e) => e.trim().toLowerCase())
    : [],
  ADMIN_USER_IDS: optional("ADMIN_USER_IDS")
    ? optional("ADMIN_USER_IDS")!
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [],
  ADMIN_PASSWORD: required("ADMIN_PASSWORD"),
  MEM0_API_KEY: optional("MEM0_API_KEY"),
  MEM0_ORG_ID: optional("MEM0_ORG_ID"),
  MEM0_PROJECT_ID: optional("MEM0_PROJECT_ID"),
  OPENAI_API_KEY: optional("OPENAI_API_KEY"),
  SENTRY_DSN: optional("SENTRY_DSN"),

  // System / Build
  NEXT_PHASE: optional("NEXT_PHASE"),
  NEXT_RUNTIME: optional("NEXT_RUNTIME"),
  get IS_WORKER() { return process.env.IS_WORKER === "true"; },
  get isBuild() { return this.NEXT_PHASE === "phase-production-build"; },
  CI: optionalBoolean("CI", false),

  // RAG / AI
  VOYAGE_API_KEY: optional("VOYAGE_API_KEY"),
  BRAINTRUST_PROJECT_NAME: optional("BRAINTRUST_PROJECT_NAME"),

  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: optional("NEXT_PUBLIC_SENTRY_DSN"),
  SENTRY_ORG: optional("SENTRY_ORG"),
  SENTRY_PROJECT: optional("SENTRY_PROJECT"),
  SENTRY_TEST_TRIGGER: optionalBoolean("SENTRY_TEST_TRIGGER", false),

  // Public URLs
  NEXT_PUBLIC_APP_URL: optional("NEXT_PUBLIC_APP_URL") || "https://getconvy.pro",
};

export type Env = typeof env;
