import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Configure DNS resolution to prefer IPv4.
    // This prevents ENETUNREACH errors on IPv4-only networks like ECS/Fargate.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");

    await import("./sentry.server.config");

    if (env.OUTBOX_POLLER_ENABLED) {
      // Keep the legacy poller available during the relay rollout.
      const { startOutboxWorker } = await import("./lib/outbox-worker");
      startOutboxWorker();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
