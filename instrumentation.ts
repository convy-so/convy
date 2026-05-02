import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Configure DNS resolution to prefer IPv4.
    // This prevents ENETUNREACH errors on IPv4-only networks like ECS/Fargate.
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
