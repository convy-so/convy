// Load .env file for non-Next.js contexts (workers, websocket server)
// This must happen before any env variables are read
// NOTE: loadEnvConfig(process.cwd()) MUST be called in the entry point of the server process (e.g. server.ts, worker.ts)
// It cannot be here because this file is shared with Client Components and 'fs' is not available.

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

const appBaseUrl = optional("APP_BASE_URL") || "http://localhost:3000";
const betterAuthUrl = optional("BETTER_AUTH_URL") || appBaseUrl;

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

  // Voice/WebSocket Configuration
  WEBSOCKET_PORT: optional("WEBSOCKET_PORT") || "3001",
  DEEPGRAM_API_KEY: optional("DEEPGRAM_API_KEY"),

  // Application base URL (for public links & embeds), e.g. https://app.convy.com
  APP_BASE_URL: appBaseUrl,
  betterAuthUrl,

  // Better Auth Client URL (for frontend)
  NEXT_PUBLIC_BETTER_AUTH_URL:
    optional("NEXT_PUBLIC_BETTER_AUTH_URL") || betterAuthUrl,

  NEXT_PUBLIC_WEBSOCKET_URL:
    optional("NEXT_PUBLIC_WEBSOCKET_URL") || "ws://localhost:3001",

  ADMIN_EMAILS: optional("ADMIN_EMAILS")
    ? optional("ADMIN_EMAILS")!
        .split(",")
        .map((e) => e.trim().toLowerCase())
    : [],
  ADMIN_PASSWORD: required("ADMIN_PASSWORD"),
};

export type Env = typeof env;
