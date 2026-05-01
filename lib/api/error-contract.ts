import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
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
    console.error(`[${context}]`, error);
  }

  return apiError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : fallbackMessage,
    { status: 500 },
  );
}
