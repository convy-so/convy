import { apiError } from "@/shared/http/api-error";

export function mapSessionAuthError(error: unknown) {
  if (
    error instanceof Error &&
    (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")
  ) {
    return apiError("UNAUTHENTICATED", error.message);
  }

  return null;
}
