import IORedis, { Redis, RedisOptions } from "ioredis";
import dns from "node:dns";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("redis");


// Configure DNS resolution to prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
  connectTimeout: 10000,
  keepAlive: 30000,
};

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


let productionRedisClient: Redis | undefined;
let productionRedisSubscriber: Redis | undefined;

export function getRedisClient(options?: { fresh?: boolean }): Redis {
  if (options?.fresh || env.IS_WORKER) {
    return new IORedis(env.REDIS_URL, getEffectiveOptions(env.REDIS_URL));
  }

  
  if (env.NODE_ENV === "production") {
    if (!productionRedisClient) {
      productionRedisClient = new IORedis(
        env.REDIS_URL,
        getEffectiveOptions(env.REDIS_URL),
      );

      productionRedisClient.on("error", (err) => {
        log.error("Redis client error", {
          error_message: err?.message,
          error_name: err?.name,
        });
      });
    }
    return productionRedisClient;
  }

  if (!global.sharedRedisClient) {
    global.sharedRedisClient = new IORedis(
      env.REDIS_URL,
      getEffectiveOptions(env.REDIS_URL),
    );

    global.sharedRedisClient.on("error", (err) => {
      log.error("Redis shared client error", {
        error_message: err?.message,
        error_name: err?.name,
      });
    });

    if (!env.isBuild) {
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
  if (options?.fresh || env.IS_WORKER) {
    return new IORedis(env.REDIS_URL, getEffectiveOptions(env.REDIS_URL));
  }

  if (env.NODE_ENV === "production") {
    if (!productionRedisSubscriber) {
      productionRedisSubscriber = new IORedis(
        env.REDIS_URL,
        getEffectiveOptions(env.REDIS_URL),
      );

      productionRedisSubscriber.on("error", (err) => {
        log.error("Redis subscriber error", {
          error_message: err?.message,
          error_name: err?.name,
        });
      });
    }
    return productionRedisSubscriber;
  }

  if (!global.sharedRedisSubscriber) {
    global.sharedRedisSubscriber = new IORedis(
      env.REDIS_URL,
      getEffectiveOptions(env.REDIS_URL),
    );

    global.sharedRedisSubscriber.on("error", (err) => {
      log.error("Redis shared subscriber error", {
        error_message: err?.message,
        error_name: err?.name,
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
    maxRetriesPerRequest: null, 
  });

  client.on("error", (err) => {
    log.error("Redis blocking client error", {
      error_message: err?.message,
      error_name: err?.name,
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

  if (productionRedisClient) {
    promises.push(productionRedisClient.quit());
    productionRedisClient = undefined;
  }

  if (productionRedisSubscriber) {
    promises.push(productionRedisSubscriber.quit());
    productionRedisSubscriber = undefined;
  }

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
    log.error("Redis test connection failed", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

