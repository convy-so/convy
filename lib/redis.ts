import "server-only";

import IORedis, { Redis, RedisOptions } from "ioredis";
import { env } from "@/lib/env";

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: {
    rejectUnauthorized: false,
  },
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    console.log(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  connectTimeout: 10000,
  keepAlive: 30000,
  family: 4, 
};

let sharedClient: Redis | null = null;
let sharedSubscriber: Redis | null = null;

export function getRedisClient(): Redis {
  if (!sharedClient) {
    sharedClient = new IORedis(env.UPSTASH_REDIS_URL, redisOptions);

    sharedClient.on("error", (err) => {
      console.error("[Redis Client] Error:", err.message);
    });

    sharedClient.on("connect", () => {
      console.log("[Redis Client] Connected");
    });

    sharedClient.on("ready", () => {
      console.log("[Redis Client] Ready");
    });

    sharedClient.on("close", () => {
      console.log("[Redis Client] Connection closed");
    });

    sharedClient.on("reconnecting", () => {
      console.log("[Redis Client] Reconnecting...");
    });
  }

  return sharedClient;
}

/**
 * Get or create shared Redis subscriber
 * Used for pub/sub operations
 */
export function getRedisSubscriber(): Redis {
  if (!sharedSubscriber) {
    sharedSubscriber = new IORedis(env.UPSTASH_REDIS_URL, redisOptions);

    sharedSubscriber.on("error", (err) => {
      console.error("[Redis Subscriber] Error:", err.message);
    });

    sharedSubscriber.on("connect", () => {
      console.log("[Redis Subscriber] Connected");
    });

    sharedSubscriber.on("ready", () => {
      console.log("[Redis Subscriber] Ready");
    });

    sharedSubscriber.on("close", () => {
      console.log("[Redis Subscriber] Connection closed");
    });

    sharedSubscriber.on("reconnecting", () => {
      console.log("[Redis Subscriber] Reconnecting...");
    });
  }

  return sharedSubscriber;
}

/**
 * Create a blnew blocking client
 * BullMQ creates these for ocking operations (BRPOP, etc.)
 * Each worker needs its own blocking client
 */
export function createBlockingClient(): Redis {
  const client = new IORedis(env.UPSTASH_REDIS_URL, redisOptions);

  client.on("error", (err) => {
    console.error("[Redis Blocking Client] Error:", err.message);
  });

  return client;
}

/**
 * Close all shared Redis connections gracefully
 * Call this during application shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  const promises: Promise<string>[] = [];

  if (sharedClient) {
    console.log("[Redis] Closing client connection...");
    promises.push(sharedClient.quit());
    sharedClient = null;
  }

  if (sharedSubscriber) {
    console.log("[Redis] Closing subscriber connection...");
    promises.push(sharedSubscriber.quit());
    sharedSubscriber = null;
  }

  await Promise.all(promises);
  console.log("[Redis] All shared connections closed");
}

/**
 * Test Redis connection
 * Returns true if connection is successful
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    console.log("[Redis] Connection test: PONG -", result);
    return result === "PONG";
  } catch (error) {
    console.error("[Redis] Connection test failed:", error);
    return false;
  }
}

