import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { toApiAuthError } from "@/lib/auth/error-map";
import { isLearningStateConflictError } from "@/lib/learning/errors";

export function handleLearningRouteError(
  error: unknown,
  fallbackMessage: string,
  route: string,
) {
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
