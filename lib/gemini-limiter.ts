/**
 * Gemini Concurrency Limiter
 *
 * A simple in-process token-bucket semaphore that caps simultaneous
 * Gemini API calls. When the app is at capacity the caller receives a
 * 503 with a Retry-After header so the client can back off gracefully
 * rather than hammering Google's quota.
 *
 * Defaults:
 *   MAX_CONCURRENT = 50   (allows ~1000 req/min at ~3 s avg stream duration)
 *   QUEUE_TIMEOUT  = 8 s  (how long a caller waits for a slot before giving up)
 */

const MAX_CONCURRENT = 50;
const QUEUE_TIMEOUT_MS = 8_000;

let active = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  console.log(
    `[GeminiLimit] acquire attempted. Active: ${active}. Queue: ${waitQueue.length}`,
  );
  return new Promise((resolve, reject) => {
    if (active < MAX_CONCURRENT) {
      active++;
      console.log(`[GeminiLimit] Slot ACQUIRED. Active: ${active}`);
      resolve();
      return;
    }

    // Queue the caller; give up after QUEUE_TIMEOUT_MS
    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(tryResolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new GeminiCapacityError());
    }, QUEUE_TIMEOUT_MS);

    function tryResolve() {
      clearTimeout(timer);
      active++;
      resolve();
    }

    waitQueue.push(tryResolve);
  });
}

function release(): void {
  active--;
  const next = waitQueue.shift();
  console.log(
    `[GeminiLimit] release. New active: ${active}. Next in queue: ${!!next}`,
  );
  if (next) next();
}

/** Thrown when the concurrency limit is reached and the queue times out. */
export class GeminiCapacityError extends Error {
  constructor() {
    super("Gemini concurrency limit reached — please retry shortly");
    this.name = "GeminiCapacityError";
  }
}

/**
 * Wraps an async function with the concurrency limiter.
 * Usage:
 *   const result = await withGeminiLimit(() => streamText({ ... }));
 */
export async function withGeminiLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Returns a 503 Response with Retry-After header.
 * Use this in route handlers when catching GeminiCapacityError.
 */
export function geminiCapacityResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "Server is busy — please retry in a few seconds",
      retryAfter: 5,
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "5",
      },
    },
  );
}

/** Current number of active Gemini calls (useful for health-checks). */
export function getActiveGeminiCalls(): number {
  return active;
}
