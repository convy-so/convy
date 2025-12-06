/**
 * Main worker entry point
 * Starts all background job workers
 *
 * Usage:
 * - Development: tsx workers/index.ts
 * - Production: node dist/workers/index.js
 */

import { testRedisConnection } from "@/lib/redis";
import conversationInsightsWorker from "./conversation-insights.worker";
import surveyAnalyticsWorker from "./survey-analytics.worker";
import sampleConversationInsightsWorker from "./sample-conversation-insights.worker";
import emailWorker from "./email.worker";
import notionSyncWorker from "./notion-sync.worker";
import notionBulkOperationWorker from "./notion-bulk-operation.worker";

console.log("🚀 Starting all workers...");

// Test Redis connection before starting workers
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
})();

console.log("✅ Conversation Insights Worker started");
console.log("✅ Survey Analytics Worker started");
console.log("✅ Sample Conversation Insights Worker started");
console.log("✅ Email Worker started");
console.log("✅ Notion Sync Worker started");
console.log("✅ Notion Bulk Operation Worker started");

console.log("\n📊 Workers are now processing jobs...");
console.log("Press Ctrl+C to gracefully shutdown\n");

// Keep the process alive
process.on("SIGTERM", () => {
  console.log("\n👋 Received SIGTERM, shutting down all workers...");
});

process.on("SIGINT", () => {
  console.log("\n👋 Received SIGINT, shutting down all workers...");
});
