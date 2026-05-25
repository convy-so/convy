import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dns from "node:dns";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Configure DNS resolution to prefer IPv4.
 * This prevents ENETUNREACH errors when connecting to databases (like Supabase)
 * that have IPv6 records in environments that only support IPv4.
 */
dns.setDefaultResultOrder("ipv4first");

/**
 * Database client management
 * Uses a lazy singleton pattern to prevent top-level side effects during build.
 * In development, we use a global variable to preserve the pool across HMR reloads.
 */

const isLocal =
  env.DATABASE_URL.includes("localhost") ||
  env.DATABASE_URL.includes("127.0.0.1");

const shouldUseInsecureTls = env.ALLOW_INSECURE_TLS && !isLocal;

const poolConfig = {
  connectionString: env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: isLocal ? undefined : { rejectUnauthorized: !shouldUseInsecureTls },
};

declare global {
  var pool: Pool | undefined;
}

export function getDb() {
  const pool = global.pool ?? new Pool(poolConfig);

  // Prevent crash on idle client errors
  if (!global.pool) {
    pool.on("error", (err) => {
      console.error("[db] idle client error", {
        message: err?.message,
        name: err?.name,
      });
    });
    global.pool = pool;
  }

  return drizzle(pool, { schema });
}

export type DbClient = ReturnType<typeof getDb>;

