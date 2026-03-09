import IORedis, { Redis, RedisOptions } from "ioredis";
import { env } from "@/lib/env";

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    // Suppress reconnection logs during build to keep output clean, but log in dev/prod
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      console.log(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
    }
    return delay;
  },
  connectTimeout: 10000,
  keepAlive: 30000,
};

// Only add TLS if using a secure redis URL (rediss://)
const getEffectiveOptions = (url: string) => {
  if (url.startsWith("rediss://")) {
    return {
      ...redisOptions,
      tls: {
        rejectUnauthorized: false,
      },
    };
  }
  return redisOptions;
};

/**
 * Redis Connection Management
 *
 * We use a lazy singleton for the main app process.
 * For separate worker processes or when explicitly needed, we allow creating fresh instances.
 */

declare global {
  // eslint-disable-next-line no-var
  var sharedRedisClient: Redis | undefined;
  // eslint-disable-next-line no-var
  var sharedRedisSubscriber: Redis | undefined;
}

export function getRedisClient(options?: { fresh?: boolean }): Redis {
  // If we're in a worker process or a fresh client is requested, bypass the singleton
  // This ensures workers don't share the same instance as producers in the same environment.
  if (options?.fresh || process.env.IS_WORKER === "true") {
    return new IORedis(env.REDIS_URL, getEffectiveOptions(env.REDIS_URL));
  }

  if (!global.sharedRedisClient) {
    global.sharedRedisClient = new IORedis(
      env.REDIS_URL,
      getEffectiveOptions(env.REDIS_URL),
    );

    global.sharedRedisClient.on("error", (err) => {
      console.error("[Redis Client] Error:", err.message);
    });

    if (process.env.NEXT_PHASE !== "phase-production-build") {
      global.sharedRedisClient.on("connect", () =>
        console.log("[Redis Client] Connected"),
      );
      global.sharedRedisClient.on("ready", () =>
        console.log("[Redis Client] Ready"),
      );
    }
  }

  return global.sharedRedisClient;
}

/**
 * Get or create shared Redis subscriber
 * Used for pub/sub operations
 */
export function getRedisSubscriber(options?: { fresh?: boolean }): Redis {
  if (options?.fresh || process.env.IS_WORKER === "true") {
    return new IORedis(env.REDIS_URL, getEffectiveOptions(env.REDIS_URL));
  }

  if (!global.sharedRedisSubscriber) {
    global.sharedRedisSubscriber = new IORedis(
      env.REDIS_URL,
      getEffectiveOptions(env.REDIS_URL),
    );

    global.sharedRedisSubscriber.on("error", (err) => {
      console.error("[Redis Subscriber] Error:", err.message);
    });
  }

  return global.sharedRedisSubscriber;
}

/**
 * Create a new blocking client
 * BullMQ creates these for blocking operations (BRPOP, etc.)
 * Each worker needs its own blocking client
 */
export function createBlockingClient(): Redis {
  const client = new IORedis(env.REDIS_URL, {
    ...getEffectiveOptions(env.REDIS_URL),
    maxRetriesPerRequest: null, // Required by BullMQ
  });

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

  if (global.sharedRedisClient) {
    console.log("[Redis] Closing client connection...");
    promises.push(global.sharedRedisClient.quit());
    global.sharedRedisClient = undefined;
  }

  if (global.sharedRedisSubscriber) {
    console.log("[Redis] Closing subscriber connection...");
    promises.push(global.sharedRedisSubscriber.quit());
    global.sharedRedisSubscriber = undefined;
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
