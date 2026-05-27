import { ActionErrorPayload, ActionErrorCode } from "@/lib/action-wrapper";

type GenericErrorPayload = {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
};

/**
 * Translates structured action or API errors into user-friendly toast messages.
 * This ensures users never see raw status codes or internal implementation details.
 */
export function getFriendlyActionError(
  error: ActionErrorPayload | GenericErrorPayload | string | unknown,
  defaultMessage?: string
): string {
  if (!error) return defaultMessage || "An unknown error occurred.";

  // Handle string errors (already translated or legacy)
  if (typeof error === "string") {
    // If it's a known error code string, we can still translate it
    return translateCode(error as ActionErrorCode, defaultMessage);
  }

  // Handle structured errors
  if (typeof error === "object" && error !== null && "code" in error) {
    const payload = error as GenericErrorPayload;
    return translateCode(payload.code as ActionErrorCode, defaultMessage || payload.message);
  }

  return defaultMessage || "Something went wrong. Please try again.";
}

function translateCode(code: string, fallback?: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return fallback || "Please check your input and try again.";
    case "UNAUTHORIZED":
    case "UNAUTHENTICATED":
      return "You need to log in to do that.";
    case "FORBIDDEN":
      return "You don't have permission for this action.";
    case "NOT_FOUND":
      return "We couldn't find what you were looking for.";
    case "SERVICE_UNAVAILABLE":
      return fallback || "A required service is temporarily unavailable. Please try again.";
    case "CONFLICT":
      return "This record already exists or there is a conflict.";
    case "INTERNAL_ERROR":
      return "Something went wrong on our end. Please try again later.";
    default:
      return (
        fallback ||
        "Something went wrong on our end. Please try again later."
      );
  }
}
