import { getRedisClient } from "../lib/redis";
import { enqueueLearningMaterialProcessing } from "../lib/queue";

async function main() {
  console.log("Connecting to Redis...");
  const redis = getRedisClient();
  console.log("Redis Client Initialized.");

  console.log("Testing ping...");
  const pingRes = await redis.ping();
  console.log("Ping response:", pingRes);

  console.log("Testing queue enqueue...");
  await enqueueLearningMaterialProcessing({
    attemptId: "test-attempt-id",
    topicId: "test-topic-id",
    classroomId: "test-classroom-id",
    userId: "test-user-id",
    storagePath: "test-path",
    fileName: "test-file.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    title: "Test File",
    description: "Testing",
  });
  console.log("Enqueued successfully!");
}

main().catch(console.error);
