import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { toApiAuthError } from "@/features/auth/public-server";
import { isLearningStateConflictError } from "@/features/tutoring/server/learning-session-state-errors";
import { logTutoringError } from "@/features/tutoring/public-server";

export function handleLearningRouteError(
  error: unknown,
  fallbackMessage: string,
  route: string,
) {
  logTutoringError("route:error", error, { route, fallbackMessage });
  const authError = toApiAuthError(error);
  if (authError) return authError;

  if (isLearningStateConflictError(error)) {
    return apiError(
      "CONFLICT",
      "This tutoring session was updated elsewhere. Please retry your last message.",
    );
  }

  return apiUnhandledError(error, fallbackMessage, route);
}
