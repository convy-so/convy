import { ActionErrorCode } from "@/shared/http/action-result";

type GenericErrorPayload = {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
};

function isActionErrorCode(value: string): value is ActionErrorCode {
  return (
    value === "VALIDATION_ERROR" ||
    value === "UNAUTHORIZED" ||
    value === "FORBIDDEN" ||
    value === "NOT_FOUND" ||
    value === "INTERNAL_ERROR"
  );
}

function isGenericErrorPayload(value: unknown): value is GenericErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "code") === "string"
  );
}

/**
 * Translates structured action or API errors into user-friendly toast messages.
 * This ensures users never see raw status codes or internal implementation details.
 */
export function getFriendlyActionError(
  error: unknown,
  defaultMessage?: string
): string {
  if (!error) return defaultMessage || "An unknown error occurred.";

  // Handle string errors (already translated or legacy)
  if (typeof error === "string") {
    // If it's a known error code string, we can still translate it
    return translateCode(error, defaultMessage);
  }

  // Handle structured errors
  if (isGenericErrorPayload(error)) {
    return translateCode(error.code, defaultMessage || error.message);
  }

  return defaultMessage || "Something went wrong. Please try again.";
}

function translateCode(code: string, fallback?: string): string {
  if (isActionErrorCode(code)) {
    switch (code) {
      case "VALIDATION_ERROR":
        return fallback || "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You need to log in to do that.";
      case "FORBIDDEN":
        return "You don't have permission for this action.";
      case "NOT_FOUND":
        return "We couldn't find what you were looking for.";
      case "INTERNAL_ERROR":
        return "Something went wrong on our end. Please try again later.";
    }
  }

  switch (code) {
    case "UNAUTHENTICATED":
      return "You need to log in to do that.";
    case "SERVICE_UNAVAILABLE":
      return fallback || "A required service is temporarily unavailable. Please try again.";
    case "CONFLICT":
      return "This record already exists or there is a conflict.";
    default:
      return (
        fallback ||
        "Something went wrong on our end. Please try again later."
      );
  }
}
