import IORedis, { Redis, RedisOptions } from "ioredis";
import dns from "node:dns";
import { env } from "@/lib/env";

// Configure DNS resolution to prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    // Suppress reconnection logs during build to keep output clean, but log in dev/prod
    if (process.env.NEXT_PHASE !== "phase-production-build") {
    }
    return delay;
  },
  connectTimeout: 10000,
  keepAlive: 30000,
};

// Only add TLS if using a secure redis URL (rediss://)
const getEffectiveOptions = (url: string) => {
  if (url.startsWith("rediss://")) {
    const rejectUnauthorized = !env.ALLOW_INSECURE_TLS;
    return {
      ...redisOptions,
      tls: {
        rejectUnauthorized,
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
   
  var sharedRedisClient: Redis | undefined;
   
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
      console.error("[redis] shared client error", {
        message: err?.message,
        name: err?.name,
      });
    });

    if (process.env.NEXT_PHASE !== "phase-production-build") {
      global.sharedRedisClient.on("connect", () => {});
      global.sharedRedisClient.on("ready", () => {});
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
      console.error("[redis] shared subscriber error", {
        message: err?.message,
        name: err?.name,
      });
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
    console.error("[redis] blocking client error", {
      message: err?.message,
      name: err?.name,
    });
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
    promises.push(global.sharedRedisClient.quit());
    global.sharedRedisClient = undefined;
  }

  if (global.sharedRedisSubscriber) {
    promises.push(global.sharedRedisSubscriber.quit());
    global.sharedRedisSubscriber = undefined;
  }

  await Promise.all(promises);
}

/**
 * Test Redis connection
 * Returns true if connection is successful
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    console.error("[redis] test connection failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

