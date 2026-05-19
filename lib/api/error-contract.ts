import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("api");


export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  options?: {
    status?: number;
    details?: Record<string, unknown>;
    headers?: HeadersInit;
  },
) {
  const status =
    options?.status ??
    (code === "UNAUTHENTICATED"
      ? 401
      : code === "UNAUTHORIZED"
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : code === "VALIDATION_ERROR"
            ? 400
            : code === "CONFLICT"
              ? 409
              : code === "RATE_LIMITED"
                ? 429
                : code === "SERVICE_UNAVAILABLE"
                  ? 503
                : 500);

  const payload: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
      ...(options?.details ? { details: options.details } : {}),
    },
  };

  return NextResponse.json(payload, {
    status,
    headers: options?.headers,
  });
}

export function apiUnhandledError(
  error: unknown,
  fallbackMessage: string,
  context?: string,
) {
  if (context) {
    log.error("Unhandled API error", {
      endpoint: context,
      ...serializeError(error),
    });
  }
  Sentry.captureException(error, { tags: { endpoint: context } });

  return apiError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : fallbackMessage,
    { status: 500 },
  );
}
