import { apiError } from "@/lib/api/error-contract";

export const surveyErrors = {
  notFound: () => apiError("NOT_FOUND", "Survey not found"),
  unauthorized: (message = "Unauthorized") => apiError("UNAUTHORIZED", message),
  unauthenticated: (message = "UNAUTHENTICATED") => apiError("UNAUTHENTICATED", message),
  validation: (message: string) => apiError("VALIDATION_ERROR", message),
};
