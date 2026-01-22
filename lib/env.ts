import { loadEnvConfig } from "@next/env";

// Load .env file for non-Next.js contexts (workers, websocket server)
// This must happen before any env variables are read
loadEnvConfig(process.cwd());

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

const betterAuthUrl = optional("BETTER_AUTH_URL")|| "http://localhost:3000";

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: required("DATABASE_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: betterAuthUrl,
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),
  RESEND_API_KEY: required("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: required("RESEND_FROM_EMAIL"),
  GOOGLE_GENERATIVE_AI_API_KEY: required("GOOGLE_GENERATIVE_AI_API_KEY"),
  UPSTASH_REDIS_URL: required("UPSTASH_REDIS_URL"),
  UPSTASH_REDIS_REST_URL: required("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: required("UPSTASH_REDIS_REST_TOKEN"),
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  ),
  // Notion Integration (Optional - for fallback)
  NOTION_API_KEY: optional("NOTION_API_KEY"),
  // Notion OAuth Integration
  NOTION_CLIENT_ID: optional("NOTION_CLIENT_ID"),
  NOTION_CLIENT_SECRET: optional("NOTION_CLIENT_SECRET"),
  NOTION_REDIRECT_URI: optional("NOTION_REDIRECT_URI"),
  // Encryption for tokens
  ENCRYPTION_KEY: optional("ENCRYPTION_KEY"),

  // Slack OAuth Integration
  SLACK_CLIENT_ID: optional("SLACK_CLIENT_ID"),
  SLACK_CLIENT_SECRET: optional("SLACK_CLIENT_SECRET"),
  SLACK_REDIRECT_URI: optional("SLACK_REDIRECT_URI"),

  // Voice/WebSocket Configuration
  WEBSOCKET_PORT: optional("WEBSOCKET_PORT") || "3001",
  GOOGLE_CLOUD_PROJECT_ID: optional("GOOGLE_CLOUD_PROJECT_ID"),
  GOOGLE_APPLICATION_CREDENTIALS: optional("GOOGLE_APPLICATION_CREDENTIALS"),

  // Voice Feature Toggles
  ENABLE_VOICE_FEATURES: optional("ENABLE_VOICE_FEATURES") === "true",
  VAD_SENSITIVITY: optional("VAD_SENSITIVITY") || "0.5",
  MAX_AUDIO_DURATION_MS: optional("MAX_AUDIO_DURATION_MS") || "300000", // 5 minutes

  // Zapier Integration
  ZAPIER_EMBED_ID: optional("ZAPIER_EMBED_ID"),

  // Billing / Payments - Stripe
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET"),

  // Billing / Payments - Coinbase Commerce (CDP Keys)
  COINBASE_CDP_API_KEY_NAME: optional("COINBASE_CDP_API_KEY_NAME"),
  COINBASE_CDP_API_KEY_PRIVATE_KEY: optional("COINBASE_CDP_API_KEY_PRIVATE_KEY"),
  COINBASE_COMMERCE_WEBHOOK_SECRET: optional(
    "COINBASE_COMMERCE_WEBHOOK_SECRET"
  ),

  // Application base URL (for public links & embeds), e.g. https://app.convy.com
  APP_BASE_URL: optional("APP_BASE_URL") || "http://localhost:3000",
  betterAuthUrl: optional("BETTER_AUTH_URL") || "http://localhost:3000",

  // Better Auth Client URL (for frontend)
  NEXT_PUBLIC_BETTER_AUTH_URL:
    optional("NEXT_PUBLIC_BETTER_AUTH_URL") || betterAuthUrl,
};

export type Env = typeof env;
