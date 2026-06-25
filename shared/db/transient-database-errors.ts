function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getErrorCode(error: unknown) {
  if (!isRecord(error)) {
    return "";
  }

  const code = error.code;
  return typeof code === "string" ? code : "";
}

export function getErrorCause(error: unknown) {
  return isRecord(error) ? error.cause ?? null : null;
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
