/**
 * Worker runtime entrypoint.
 * Starts all background job workers.
 *
 * Usage:
 * - Development: tsx shared/infra/workers/worker-runtime.ts
 * - Production: node dist/shared/infra/workers/worker-runtime.js
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import * as Sentry from "@sentry/node";

import { scrubSentryEvent } from "@/features/privacy/public-server";
import { env } from "@/shared/config/server-env";
import { testRedisConnection } from "@/shared/infra/redis";
import surveyAnalyticsWorker from "@/features/surveys/workers/survey-analytics.worker";
import tutoringReportWorker from "@/features/tutoring/workers/tutoring-report.worker";
import lessonMaterialWorker from "@/features/tutoring/workers/lesson-material.worker";
import lessonMaterialBatchWorker from "@/features/tutoring/workers/lesson-material-batch.worker";

import emailWorker from "./email.worker";
import contentTranslationWorker from "./content-translation.worker";

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

const workers = [
  { name: "Survey Analytics", worker: surveyAnalyticsWorker },
  { name: "Email", worker: emailWorker },
  { name: "Tutoring Report", worker: tutoringReportWorker },
  { name: "Lesson Material", worker: lessonMaterialWorker },
  { name: "Lesson Material Batch", worker: lessonMaterialBatchWorker },
  { name: "Content Translation", worker: contentTranslationWorker },
];

async function startWorkers() {
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
}

void startWorkers();

let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
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

process.on("SIGTERM", () => void gracefulShutdown());
process.on("SIGINT", () => void gracefulShutdown());
