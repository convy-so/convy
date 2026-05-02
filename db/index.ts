import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dns from "node:dns";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Configure DNS resolution to prefer IPv4.
 * This prevents ENETUNREACH errors when connecting to databases (like Supabase)
 * that have IPv6 records in environments that only support IPv4 (like standard ECS/Fargate).
 */
dns.setDefaultResultOrder("ipv4first");

/**
 * Database client management
 * Uses a lazy singleton pattern to prevent top-level side effects during build.
 * In development, we use a global variable to preserve the pool across HMR reloads.
 */

// Determine if we need SSL (Remote DB)
const isLocal =
  env.DATABASE_URL.includes("localhost") ||
  env.DATABASE_URL.includes("127.0.0.1");

const shouldUseInsecureTls = env.ALLOW_INSECURE_TLS && !isLocal;

const poolConfig = {
  connectionString: env.DATABASE_URL,
  max: 5,
  ssl: isLocal ? undefined : { rejectUnauthorized: !shouldUseInsecureTls },
};

declare global {
  var db: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var pool: Pool | undefined;
}

export function getDb() {
  if (global.db) return global.db;

  const pool = new Pool(poolConfig);

  // Prevent crash on idle client errors
  pool.on("error", (err) => {
    console.error("[db] idle client error", {
      message: err?.message,
      name: err?.name,
    });
  });

  const db = drizzle(pool, { schema });

  // In Next.js, we want to persist the connection across HMR in dev.
  // In production, each request/edge function might get its own,
  // but during build, we MUST NOT instantiate this at the top level of a module.
  if (env.NODE_ENV !== "production") {
    global.db = db;
    global.pool = pool;
  }

  return db;
}

export type DbClient = ReturnType<typeof getDb>;

