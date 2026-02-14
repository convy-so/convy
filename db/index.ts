
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import * as schema from "./schema";

// Determine if we need SSL (Remote DB)
const isLocal = env.DATABASE_URL.includes("localhost") || env.DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Reduce connection limit for dev environment to avoid hitting limits
  // (Next.js HMR + Worker + WS Server can spawn many connections)
  max: isLocal ? 10 : 5,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// Prevent crash on idle client errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit process
});

export const db = drizzle(pool, { schema });

export type DbClient = typeof db;
