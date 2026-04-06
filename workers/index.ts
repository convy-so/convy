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

// Initialize Sentry for the standalone Node.js Project (Workers)
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || "development",
  serverName: "worker-process",
  sendDefaultPii: false,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

process.env.IS_WORKER = "true";

import { testRedisConnection } from "@/lib/redis";

import conversationInsightsWorker from "./conversation-insights.worker";
import surveyAnalyticsWorker from "./survey-analytics.worker";
import emailWorker from "./email.worker";
import learningPatternsWorker from "./learning-patterns.worker";
import tutoringReportWorker from "./tutoring-report.worker";
import evalRunWorker from "./eval-run.worker";
import contentTranslationWorker from "./content-translation.worker";
import { startOutboxRelay, type OutboxRelayHandle } from "./outbox-relay";

// Collect all workers for coordinated shutdown
const workers = [
  { name: "Conversation Insights", worker: conversationInsightsWorker },
  { name: "Survey Analytics", worker: surveyAnalyticsWorker },
  { name: "Email", worker: emailWorker },
  { name: "Learning Patterns", worker: learningPatternsWorker },
  { name: "Tutoring Report", worker: tutoringReportWorker },
  { name: "Eval Run", worker: evalRunWorker },
  { name: "Content Translation", worker: contentTranslationWorker },
];
let outboxRelay: OutboxRelayHandle | null = null;
// Test Redis connection before confirming workers are ready
(async () => {
  const isConnected = await testRedisConnection();

  if (!isConnected) {
    process.exit(1);
  }


  // Schedule recurring jobs (none currently)
  outboxRelay = await startOutboxRelay();

  if (process.env.SENTRY_TEST_TRIGGER === "true") {
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
    const closePromises = workers.map(async ({ worker }) => {
      try {
        await worker.close();
      } catch (error) {
      }
    });

    // Wait for all workers to close with a timeout
    await Promise.race([
      Promise.all([
        ...closePromises,
        outboxRelay?.stop(),
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown timeout")), 30000),
      ),
    ]);

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => void gracefulShutdown());
process.on("SIGINT", () => void gracefulShutdown());


