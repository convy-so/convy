/**
 * AI Call Retry Utility
 *
 * Wraps any async AI call with exponential backoff retry logic.
 * Only retries on transient Google API errors (503 / UNAVAILABLE / overloaded).
 * All other errors are re-thrown immediately.
 */

const RETRYABLE_SIGNALS = [
  "503",
  "UNAVAILABLE",
  "overloaded",
  "The model is overloaded",
  "SERVICE_UNAVAILABLE",
];

function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return RETRYABLE_SIGNALS.some((signal) => msg.includes(signal));
}

/**
 * Wraps an async function with retry logic for transient Gemini API errors.
 *
 * @param fn      - The async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param baseDelayMs - Base delay in ms; doubles each attempt (default: 1000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[withRetry] Gemini UNAVAILABLE — attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
