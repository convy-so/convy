import * as Sentry from "@sentry/nextjs";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Configure DNS resolution to prefer IPv4.
    // This prevents ENETUNREACH errors on IPv4-only networks like ECS/Fargate.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");

    await import("./sentry.server.config");

    // Start the outbox worker that polls workspace_outbox and publishes to Redis.
    const { startOutboxWorker } = await import("./lib/outbox-worker");
    startOutboxWorker();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
