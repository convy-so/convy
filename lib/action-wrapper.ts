/**
 * Centralized error handling for server actions
 * Provides consistent error responses and logging
 */

import { z } from "zod";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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

export class RateLimitError extends ActionError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
  }
}

/**
 * Wrap a server action with standardized error handling
 * 
 * @param handler - The action handler function
 * @param context - Context name for logging (e.g., "updateSurveyAction")
 * @returns Promise resolving to ActionResult
 * 
 * @example
 * export async function updateSurveyAction(input) {
 *   return withErrorHandling(async () => {
 *     const session = await getVerifiedSession();
 *     // ... business logic
 *     return { success: true, data: result };
 *   }, "updateSurveyAction");
 * }
 */
export async function withErrorHandling<T>(
  handler: () => Promise<ActionResult<T>>,
  context: string
): Promise<ActionResult<T>> {
  try {
    return await handler();
  } catch (error) {
    // Log error with context
    console.error(`[${context}] Failed:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return {
        success: false,
        error: firstError?.message ?? "Validation error",
      };
    }

    // Handle custom action errors
    if (error instanceof ActionError) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Handle standard errors
    if (error instanceof Error) {
      // Authentication errors
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }

      // Rate limit errors
      if (error.message.startsWith("AI_RATE_LIMIT_EXCEEDED")) {
        return { success: false, error: error.message };
      }

      // Generic error message
      return { success: false, error: error.message };
    }

    // Unknown error type
    return { success: false, error: `${context} failed` };
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
