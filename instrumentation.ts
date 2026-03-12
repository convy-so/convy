import * as Sentry from "@sentry/nextjs";
import dns from "node:dns";

// Configure DNS resolution to prefer IPv4.
// This prevents ENETUNREACH errors on IPv4-only networks like ECS/Fargate.
if (process.env.NEXT_RUNTIME === "nodejs") {
  dns.setDefaultResultOrder("ipv4first");
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
