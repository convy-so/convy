/**
 * Centralised logging via Sentry Structured Logs.
 *
 * Provides a thin wrapper around `Sentry.logger` that:
 *  - Enforces a consistent `service` attribute on every log line
 *  - Keeps all log call-sites decoupled from the Sentry import
 *  - Works across the Next.js app server, edge runtime, and browser
 *
 * For Workers and WebSocket (standalone Node processes that initialise
 * `@sentry/node` directly), use `Sentry.logger` from that package —
 * the API is identical.
 *
 * Requirements:
 *  - `enableLogs: true` must be set in every `Sentry.init()` call
 *  - SDK version ≥ 9.41.0  (@sentry/nextjs v10 satisfies this)
 *
 * Usage:
 *   import { createLogger } from "@/shared/infra/logger";
 *   const log = createLogger("redis");
 *   log.error("client error", { error_code: err.code, error_message: err.message });
 */

import * as Sentry from "@sentry/nextjs";

// Sentry log attributes must be scalar — no nested objects or Error instances.
export type LogAttrs = Record<string, string | number | boolean>;

export interface ServiceLogger {
  trace: (message: string, attrs?: LogAttrs) => void;
  debug: (message: string, attrs?: LogAttrs) => void;
  info:  (message: string, attrs?: LogAttrs) => void;
  warn:  (message: string, attrs?: LogAttrs) => void;
  error: (message: string, attrs?: LogAttrs) => void;
  fatal: (message: string, attrs?: LogAttrs) => void;
}

/**
 * Creates a logger that automatically tags every log line with `{ service }`.
 *
 * @param service - Short, lowercase identifier for the module (e.g. "redis", "cache", "action")
 */
export function createLogger(service: string): ServiceLogger {
  const tag = { service } satisfies LogAttrs;

  return {
    trace: (msg, attrs) => Sentry.logger.trace(msg, { ...tag, ...attrs }),
    debug: (msg, attrs) => Sentry.logger.debug(msg, { ...tag, ...attrs }),
    info:  (msg, attrs) => Sentry.logger.info(msg,  { ...tag, ...attrs }),
    warn:  (msg, attrs) => Sentry.logger.warn(msg,  { ...tag, ...attrs }),
    error: (msg, attrs) => Sentry.logger.error(msg, { ...tag, ...attrs }),
    fatal: (msg, attrs) => Sentry.logger.fatal(msg, { ...tag, ...attrs }),
  };
}

/**
 * Serialise an unknown caught value into flat, Sentry-safe scalar attributes.
 *
 * @example
 *   log.error("connection failed", serializeError(err));
 */
export function serializeError(error: unknown): LogAttrs {
  if (error instanceof Error) {
    return {
      error_name:    error.name,
      error_message: error.message,
      ...(error.stack ? { error_stack: error.stack.slice(0, 500) } : {}),
    };
  }
  return { error_message: String(error) };
}
