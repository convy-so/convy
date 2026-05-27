/**
 * Centralized error handling for server actions
 * Provides consistent error responses and logging
 */

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createLogger, serializeError } from "@/lib/logger";
import { toActionAuthError } from "@/lib/auth/error-map";

const log = createLogger("action");


export type ActionErrorCode = 
  | "UNAUTHORIZED" 
  | "FORBIDDEN" 
  | "NOT_FOUND" 
  | "VALIDATION_ERROR" 
  | "INTERNAL_ERROR";

export type ActionErrorPayload = {
  code: ActionErrorCode | string;
  message?: string;
  details?: Record<string, string[] | undefined>;
  data?: unknown;
};

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: ActionErrorPayload };

/**
 * Standard error types that can be thrown in actions
 */
export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export class UnauthorizedError extends ActionError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends ActionError {
  constructor(message: string = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends ActionError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends ActionError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

/**
 * Wrap a server action with standardized error handling
 * 
 * @param handler - The action handler function
 * @param context - Context name for logging (e.g., "updateSurveyAction")
 * @returns Promise resolving to ActionResult
 */
export async function withErrorHandling<T>(
  handler: () => Promise<ActionResult<T>>,
  context: string
): Promise<ActionResult<T>> {
  try {
    return await handler();
  } catch (error) {
    // Log and capture unknown errors for debugging
    log.error("Server action failed", {
      action: context,
      ...serializeError(error),
    });
    // Capture as Sentry issue for alerting & stack trace (only for unexpected errors)
    if (
      !(error instanceof z.ZodError) &&
      !(error instanceof ActionError)
    ) {
      Sentry.captureException(error, { tags: { action: context } });
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.flatten().fieldErrors
        }
      };
    }

    // Handle custom action errors
    if (error instanceof ActionError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      };
    }

    const mappedAuthError = toActionAuthError(error);
    if (mappedAuthError) {
      return {
        success: false,
        error: { code: mappedAuthError.code, message: mappedAuthError.message },
      };
    }

    // Handle standard errors
    if (error instanceof Error) {

      // Generic error message (consider hiding this message in production if it exposes internals)
      return { 
        success: false, 
        error: { code: "INTERNAL_ERROR", message: error.message }
      };
    }

    // Unknown error type
    return { 
      success: false, 
      error: { code: "INTERNAL_ERROR", message: `${context} failed` }
    };
  }
}

/**
 * Validate input with Zod schema and throw ValidationError on failure
 * 
 * @example
 * const input = validateInput(rawInput, createSurveySchema);
 */
export function validateInput<T>(
  input: unknown,
  schema: z.ZodSchema<T>
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.errors[0];
    throw new ValidationError(
      firstError?.message ?? "Validation failed"
    );
  }
  return result.data;
}

/**
 * Assert a condition or throw an error
 * 
 * @example
 * assertExists(survey, "Survey");
 * assertPermission(canEdit, "Editor access required");
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource);
  }
}

export function assertPermission(
  condition: boolean,
  message: string = "Unauthorized"
): asserts condition {
  if (!condition) {
    throw new ForbiddenError(message);
  }
}

export function assertState(
  condition: boolean,
  message: string
): asserts condition {
  if (!condition) {
    throw new ValidationError(message);
  }
}
