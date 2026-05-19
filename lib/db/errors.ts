export function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "";
  }

  return String((error as { code?: unknown }).code ?? "");
}

export function getErrorCause(error: unknown) {
  return error && typeof error === "object" && "cause" in error
    ? (error as { cause?: unknown }).cause
    : null;
}

export function isTransientDatabaseError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const cause = getErrorCause(error);
  const values = [
    error.message,
    getErrorCode(error),
    cause instanceof Error ? cause.message : "",
    getErrorCode(cause),
  ];

  return values.some((value) =>
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "timeout exceeded when trying to connect",
      "Connection terminated unexpectedly",
      "read ECONNRESET",
      "remaining connection slots are reserved",
      "too many clients",
    ].some((token) => value.includes(token)),
  );
}
