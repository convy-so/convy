export function summarizeErrorForLogs(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
  };
}
