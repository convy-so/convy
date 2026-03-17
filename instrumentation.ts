import * as Sentry from "@sentry/nextjs";
if (process.env.NEXT_RUNTIME === "nodejs") {
  const dns = await import("node:dns");
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
