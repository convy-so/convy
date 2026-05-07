import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { isLearningStateConflictError } from "@/lib/learning/errors";

export function handleLearningRouteError(
  error: unknown,
  fallbackMessage: string,
  route: string,
) {
  if (isLearningStateConflictError(error)) {
    return apiError(
      "CONFLICT",
      "This tutoring session was updated elsewhere. Please retry your last message.",
    );
  }

  return apiUnhandledError(error, fallbackMessage, route);
}
