import * as Sentry from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";
import { BraintrustExporter } from "braintrust";

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

  // Register Braintrust as an OpenTelemetry exporter for AI SDK tracing.
  // All generateText/streamText calls with experimental_telemetry enabled
  // will automatically appear in the Braintrust dashboard.
  if (process.env.BRAINTRUST_PROJECT_NAME) {
    registerOTel({
      serviceName: "convy",
      traceExporter: new BraintrustExporter({
        parent: `project_name:${process.env.BRAINTRUST_PROJECT_NAME}`,
        filterAISpans: true,
      }),
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
