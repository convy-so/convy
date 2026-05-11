import { apiError } from "@/lib/api/error-contract";

export function mapSessionAuthError(error: unknown) {
  if (
    error instanceof Error &&
    (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")
  ) {
    return apiError("UNAUTHENTICATED", error.message);
  }

  return null;
}
