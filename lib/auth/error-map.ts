import { apiError } from "@/lib/api/error-contract";
import { AuthError } from "@/lib/auth/dal";

export type MappedActionAuthError = {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "SERVICE_UNAVAILABLE";
  message: string;
};

export function toApiAuthError(error: unknown) {
  if (error instanceof AuthError) {
    if (error.code === "SERVICE_UNAVAILABLE") {
      return apiError("SERVICE_UNAVAILABLE", error.message);
    }
    if (error.code === "UNAUTHENTICATED" || error.code === "EMAIL_NOT_VERIFIED") {
      return apiError("UNAUTHENTICATED", error.message);
    }
    if (error.code === "INVALID_ACCOUNT_STATE") {
      return apiError("UNAUTHORIZED", error.message);
    }
    return apiError("UNAUTHORIZED", error.message);
  }
  return null;
}

export function toActionAuthError(error: unknown): MappedActionAuthError | null {
  if (!(error instanceof AuthError)) return null;
  if (error.code === "SERVICE_UNAVAILABLE") {
    return { code: "SERVICE_UNAVAILABLE", message: error.message };
  }
  if (error.code === "UNAUTHENTICATED" || error.code === "EMAIL_NOT_VERIFIED") {
    return { code: "UNAUTHORIZED", message: error.message };
  }
  if (error.code === "INVALID_ACCOUNT_STATE") {
    return { code: "UNAUTHORIZED", message: error.message };
  }
  return { code: "FORBIDDEN", message: error.message };
}
