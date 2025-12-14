/**
 * Main worker entry point
 * Starts all background job workers
 *
 * Usage:
 * - Development: tsx workers/index.ts
 * - Production: node dist/workers/index.js
 */

import { testRedisConnection } from "@/lib/redis";

// Import all workers - this actually starts them since each worker file
// creates a Worker instance that begins processing immediately
import conversationInsightsWorker from "./conversation-insights.worker";
import surveyAnalyticsWorker from "./survey-analytics.worker";
import sampleConversationInsightsWorker from "./sample-conversation-insights.worker";
import emailWorker from "./email.worker";
import notionSyncWorker from "./notion-sync.worker";
import notionBulkOperationWorker from "./notion-bulk-operation.worker";

// Collect all workers for coordinated shutdown
const workers = [
  { name: "Conversation Insights", worker: conversationInsightsWorker },
  { name: "Survey Analytics", worker: surveyAnalyticsWorker },
  {
    name: "Sample Conversation Insights",
    worker: sampleConversationInsightsWorker,
  },
  { name: "Email", worker: emailWorker },
  { name: "Notion Sync", worker: notionSyncWorker },
  { name: "Notion Bulk Operation", worker: notionBulkOperationWorker },
];

console.log("🚀 Starting all workers...");

// Test Redis connection before confirming workers are ready
(async () => {
  console.log("🔍 Testing Redis connection...");
  const isConnected = await testRedisConnection();

  if (!isConnected) {
    console.error("\n❌ Redis connection failed!");
    console.error("Make sure UPSTASH_REDIS_URL is set correctly in .env");
    console.error(
      "Get it from: Upstash Console > Your Database > Connect > Redis URL"
    );
    process.exit(1);
  }

  console.log("✅ Redis connection successful\n");

  // Log all workers that are now running
  for (const { name } of workers) {
    console.log(`✅ ${name} Worker started`);
  }

  console.log("\n📊 Workers are now processing jobs...");
  console.log("Press Ctrl+C to gracefully shutdown\n");
})();

// Graceful shutdown flag to prevent multiple shutdowns
let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * Closes all workers in parallel and waits for them to finish
 */
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log("Shutdown already in progress...");
    return;
  }

  isShuttingDown = true;
  console.log(
    `\n👋 Received ${signal}, shutting down all workers gracefully...`
  );

  try {
    // Close all workers in parallel
    const closePromises = workers.map(async ({ name, worker }) => {
      try {
        await worker.close();
        console.log(`✅ ${name} Worker closed`);
      } catch (error) {
        console.error(`❌ Error closing ${name} Worker:`, error);
      }
    });

    // Wait for all workers to close with a timeout
    await Promise.race([
      Promise.all(closePromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown timeout")), 30000)
      ),
    ]);

    console.log("\n✅ All workers shut down successfully");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during shutdown:", error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  gracefulShutdown("uncaughtException").catch(() => process.exit(1));
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled rejection at:", promise, "reason:", reason);
});
