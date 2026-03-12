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

const poolConfig = {
  connectionString: env.DATABASE_URL,
  // Reduce connection limit for dev environment to avoid hitting limits
  max: isLocal ? 10 : 5,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
};

declare global {
  // eslint-disable-next-line no-var
  var db: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var pool: Pool | undefined;
}

export function getDb() {
  if (global.db) return global.db;

  const pool = new Pool(poolConfig);

  // Prevent crash on idle client errors
  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });

  const db = drizzle(pool, { schema });

  // In Next.js, we want to persist the connection across HMR in dev.
  // In production, each request/edge function might get its own,
  // but during build, we MUST NOT instantiate this at the top level of a module.
  if (process.env.NODE_ENV !== "production") {
    global.db = db;
    global.pool = pool;
  }

  return db as NonNullable<typeof global.db>;
}

export type DbClient = ReturnType<typeof getDb>;
