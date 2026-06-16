/**
 * Main worker entry point
 * Starts all background job workers
 *
 * Usage:
 * - Development: tsx workers/index.ts
 * - Production: node dist/workers/index.js
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import * as Sentry from "@sentry/node";
import { scrubSentryEvent } from "@/lib/privacy/sentry";
import { env } from "@/lib/env";

// Initialize Sentry for the standalone Node.js Project (Workers)
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: env.NODE_ENV,
  serverName: "worker-process",
  sendDefaultPii: false,
  enableLogs: true,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

process.env.IS_WORKER = "true";

import { testRedisConnection } from "@/lib/redis";

import surveyAnalyticsWorker from "./survey-analytics.worker";
import emailWorker from "./email.worker";
import tutoringReportWorker from "./tutoring-report.worker";
import learningMaterialWorker from "./learning-material.worker";
import learningMaterialBatchWorker from "./learning-material-batch.worker";

import contentTranslationWorker from "./content-translation.worker";

// Collect all workers for coordinated shutdown
const workers = [
  { name: "Survey Analytics", worker: surveyAnalyticsWorker },
  { name: "Email", worker: emailWorker },
  { name: "Tutoring Report", worker: tutoringReportWorker },
  { name: "Learning Material", worker: learningMaterialWorker },
  { name: "Learning Material Batch", worker: learningMaterialBatchWorker },

  { name: "Content Translation", worker: contentTranslationWorker },
];
// Test Redis connection before confirming workers are ready
(async () => {
  const isConnected = await testRedisConnection();

  if (!isConnected) {
    console.error("[workers] Redis connection failed; workers will exit");
    process.exit(1);
  }

  console.info("[workers] ready", {
    workers: workers.map(({ name }) => name).join(", "),
  });
  Sentry.logger.info("Workers ready", {
    service: "workers",
    worker_names: workers.map(({ name }) => name).join(", "),
  });

  if (env.SENTRY_TEST_TRIGGER) {
    throw new Error("Sentry Test Worker Error: This is a test error from the Worker process.");
  }

})();

// Graceful shutdown flag to prevent multiple shutdowns
let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * Closes all workers in parallel and waits for them to finish
 */
async function gracefulShutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    // Close all workers in parallel
    const closePromises = workers.map(async ({ name, worker }) => {
      try {
        await worker.close();
      } catch (error) {
        Sentry.logger.error("Worker failed to close during shutdown", {
          service: "workers",
          worker_name: name,
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Wait for all workers to close with a timeout
    await Promise.race([
      Promise.all(closePromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown timeout")), 30000),
      ),
    ]);

    process.exit(0);
  } catch (error) {
    Sentry.logger.error("Graceful shutdown failed", {
      service: "workers",
      error_message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => void gracefulShutdown());
process.on("SIGINT", () => void gracefulShutdown());
