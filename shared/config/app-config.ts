

import { env } from "@/shared/config/server-env";
import {
  SURVEY_DEFAULTS,
  SURVEY_LIMITS as SURVEY_DOMAIN_LIMITS,
} from "@/shared/surveys/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * Survey limits and constraints
 */
export const SURVEY_LIMITS = {
  /** Maximum surveys per user to prevent abuse */
  MAX_SURVEYS_PER_SCOPE: 5,
  
  /** Maximum voice surveys per scope (more expensive to process) */
  MAX_VOICE_SURVEYS_PER_SCOPE: 2,
  
  /** Maximum participant limit per survey */
  MAX_PARTICIPANT_LIMIT: SURVEY_DOMAIN_LIMITS.maxParticipantLimit,
  
  /** Default participant limit for new surveys */
  DEFAULT_PARTICIPANT_LIMIT: SURVEY_DEFAULTS.participantLimit,
  
  /** Maximum title length */
  MAX_TITLE_LENGTH: 200,
  
  /** Maximum custom slug length */
  MAX_CUSTOM_SLUG_LENGTH: 64,
  MIN_CUSTOM_SLUG_LENGTH: 3,
  
  /** Maximum conversation duration in minutes */
  MAX_CONVERSATION_DURATION_MINUTES:
    SURVEY_DOMAIN_LIMITS.maxConversationDurationMinutes,
} as const;

/**
 * File upload limits
 */
export const UPLOAD_LIMITS = {
  /** Audio upload limit based on Deepgram processing constraints */
  MAX_AUDIO_UPLOAD_MB: 8,
  MAX_AUDIO_UPLOAD_BYTES: 8 * 1024 * 1024,
  
  /** Lesson material upload limit */
  MAX_LEARNING_MATERIAL_MB: 12,
  MAX_LEARNING_MATERIAL_BYTES: 12 * 1024 * 1024,
  
  /** Maximum text extraction length */
  MAX_TEXT_EXTRACTION_CHARS: 120_000,
} as const;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  /** Default TTL for cache entries (1 hour) */
  DEFAULT_TTL_SECONDS: 3600,
  
  /** Google prompt cache TTL */
  GOOGLE_CACHE_TTL_SECONDS: 3600,
  
  /** Minimum cacheable prompt prefix length */
  MIN_CACHEABLE_PREFIX_CHARS: 1400,
  
  /** Cache refresh window for Google cached content */
  GOOGLE_CACHE_REFRESH_WINDOW_SECONDS: 300,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  chat: {
    max: 20,
    window: "1 m" as const,
  },
  api: {
    max: 100,
    window: "10 m" as const,
  },
  auth: {
    max: 20,
    window: "10 m" as const,
  },
  upload: {
    max: 12,
    window: "10 m" as const,
  },
  expensiveAi: {
    max: 30,
    window: "10 m" as const,
  },
} as const;

/**
 * AI/LLM configuration
 */
export const AI_CONFIG = {
  /** Default model for general operations */
  DEFAULT_MODEL: "gemini-3.1-flash-lite" as const,
  
  /** Model for high-volume analysis tasks */
  ANALYSIS_MODEL: "gemini-3.1-flash-lite" as const,
  
  /** Default temperature for generation */
  DEFAULT_TEMPERATURE: 0.7,
  
  /** Default max tokens for generation */
  DEFAULT_MAX_TOKENS: 2000,
  
  /** Token reserve for model responses */
  RESPONSE_TOKEN_RESERVE: 4000,
  
  /** Model context limits (conservative estimates) */
  MODEL_CONTEXT_LIMITS: {
    "gpt-4.1-mini": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gemini-3-flash-preview": 1000000,
    "gemini-3.1-flash-lite": 1000000,
    "gemini-2.5-flash": 1000000,
    "gemini-2.5-flash-lite": 1000000,
    "gemini-1.5-pro": 2000000,
  } as const,
  
  /** Default context limit for unknown models */
  DEFAULT_CONTEXT_LIMIT: 100000,
} as const;

/**
 * Input sanitization configuration
 */
export const SANITIZATION_CONFIG = {
  /** Maximum length for user input in prompts */
  MAX_USER_INPUT_LENGTH: 1000,
  
  /** Maximum length for brief fields */
  MAX_BRIEF_FIELD_LENGTH: 500,
  
  /** Maximum items in arrays (topics, criteria, etc.) */
  MAX_ARRAY_ITEMS: 20,
  
  /** Maximum length per array item */
  MAX_ARRAY_ITEM_LENGTH: 200,
} as const;

/**
 * External API timeout configuration
 */
export const TIMEOUT_CONFIG = {
  /** Default timeout for external API calls (10 seconds) */
  DEFAULT_API_TIMEOUT_MS: 10000,
  
  /** Timeout for LLM API calls (30 seconds) */
  LLM_API_TIMEOUT_MS: 30000,
  
  /** Timeout for database queries (5 seconds) */
  DB_QUERY_TIMEOUT_MS: 5000,
  
  /** Timeout for cache operations (2 seconds) */
  CACHE_TIMEOUT_MS: 2000,
} as const;

/**
 * Worker configuration
 */
export const WORKER_CONFIG = {
  /** Graceful shutdown timeout (30 seconds) */
  SHUTDOWN_TIMEOUT_MS: 30000,
  
  /** Email worker concurrency */
  EMAIL_WORKER_CONCURRENCY: 10,
  
  /** Email worker rate limit */
  EMAIL_WORKER_RATE_LIMIT: {
    max: 50,
    duration: 60000,
  },
  
  /** Survey analytics worker concurrency */
  ANALYTICS_WORKER_CONCURRENCY: 1,
} as const;

/**
 * Database configuration
 */
export const DB_CONFIG = {
  /** Connection pool size for local development */
  LOCAL_POOL_SIZE: 10,
  
  /** Connection pool size for production */
  PRODUCTION_POOL_SIZE: 5,
} as const;

/**
 * Get configuration value with environment override
 */
export function getConfig(
  key: string,
  defaultValue: string,
  parser?: (value: string) => string,
): string;
export function getConfig<T>(
  key: string,
  defaultValue: T,
  parser: (value: string) => T,
): T;
export function getConfig<T>(
  key: string,
  defaultValue: T,
  parser?: (value: string) => T,
): T {
  const envValue = process.env[key];
  if (envValue === undefined) {
    return defaultValue;
  }
  
  if (parser) {
    try {
      return parser(envValue);
    } catch {
      Sentry.logger.warn("Config: failed to parse env variable, using default", {
        service: "config",
        env_key: key,
      });
      return defaultValue;
    }
  }

  if (typeof defaultValue === "string") {
    return envValue as T;
  }

  return defaultValue;
}

/**
 * Export all configuration as a single object for convenience
 */
export const config = {
  survey: SURVEY_LIMITS,
  upload: UPLOAD_LIMITS,
  cache: CACHE_CONFIG,
  rateLimit: RATE_LIMIT_CONFIG,
  ai: AI_CONFIG,
  sanitization: SANITIZATION_CONFIG,
  timeout: TIMEOUT_CONFIG,
  worker: WORKER_CONFIG,
  db: DB_CONFIG,
  env,
} as const;

export type AppConfig = typeof config;
