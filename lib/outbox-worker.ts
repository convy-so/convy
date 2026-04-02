import { publishPendingOutboxEntries } from "@/lib/collaboration-service";

const OUTBOX_POLL_INTERVAL_MS = 500;

declare global {
  var outboxWorkerTimer: ReturnType<typeof setInterval> | undefined;
}

/**
 * Starts the outbox worker, which polls `workspace_outbox` every 500ms and
 * publishes pending entries to Redis Pub/Sub.
 *
 * Uses a global flag to be safe across Next.js hot-module reloads in dev —
 * the same pattern used by queue.ts for BullMQ queue singletons.
 *
 * Should be called once from instrumentation.ts (nodejs runtime only).
 */
export function startOutboxWorker() {
  if (global.outboxWorkerTimer !== undefined) {
    return;
  }

  global.outboxWorkerTimer = setInterval(async () => {
    try {
      await publishPendingOutboxEntries();
    } catch (err) {
      console.error("[OutboxWorker] Failed to publish pending outbox entries:", err);
    }
  }, OUTBOX_POLL_INTERVAL_MS);

  // Allow the Node.js process to exit cleanly even if the interval is live.
  global.outboxWorkerTimer.unref?.();

}

/**
 * Stops the outbox worker. Called during graceful shutdown.
 */
export function stopOutboxWorker() {
  if (global.outboxWorkerTimer !== undefined) {
    clearInterval(global.outboxWorkerTimer);
    global.outboxWorkerTimer = undefined;
  }
}
