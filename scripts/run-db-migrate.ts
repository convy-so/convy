/**
 * Apply pending Drizzle SQL migrations from db/migrations/.
 *
 * Uses DATABASE_DIRECT_URL when set (recommended for Supabase DDL),
 * otherwise falls back to DATABASE_URL.
 *
 * Usage:
 *   pnpm db:migrate
 *   pnpm exec tsx --env-file=.env.prod scripts/run-db-migrate.ts
 */
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  getDatabaseConnectionInfo,
  maskConnectionString,
} from "@/lib/db/connection-mode";

dns.setDefaultResultOrder("ipv4first");

const MIGRATIONS_FOLDER = path.join(process.cwd(), "db", "migrations");

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL (or DATABASE_DIRECT_URL). Set it in .env.prod or pass --env-file.",
    );
  }
  return url;
}

function listSqlMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sql") &&
        !entry.name.startsWith("."),
    )
    .map((entry) => entry.name)
    .sort();
}

function validateJournalMatchesFiles() {
  const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    return;
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
    entries?: Array<{ tag: string }>;
  };

  const expected = (journal.entries ?? []).map((entry) => `${entry.tag}.sql`);
  const missing = expected.filter(
    (filename) => !fs.existsSync(path.join(MIGRATIONS_FOLDER, filename)),
  );

  if (missing.length > 0) {
    throw new Error(
      [
        "Migration journal references SQL files that are not in db/migrations/.",
        `Missing: ${missing.join(", ")}`,
        "Commit all migration SQL files, or squash meta/_journal.json to match the files you ship.",
      ].join(" "),
    );
  }
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const connectionInfo = getDatabaseConnectionInfo(databaseUrl);
  const migrationFiles = listSqlMigrationFiles();

  console.log("[db-migrate] connection:", maskConnectionString(databaseUrl));
  console.log("[db-migrate] mode:", connectionInfo.mode);
  console.log("[db-migrate] migrations folder:", MIGRATIONS_FOLDER);

  if (migrationFiles.length === 0) {
    console.log(
      "[db-migrate] No SQL migration files found. Skipping.",
      "Run `pnpm db:generate` locally after schema changes, commit db/migrations/, then redeploy.",
    );
    return;
  }

  validateJournalMatchesFiles();

  console.log(
    `[db-migrate] Found ${migrationFiles.length} migration file(s): ${migrationFiles.join(", ")}`,
  );
  console.log("[db-migrate] Applying pending migrations…");

  const shouldUseInsecureTls =
    process.env.ALLOW_INSECURE_TLS === "true" && !connectionInfo.isLocal;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: connectionInfo.isLocal
      ? undefined
      : { rejectUnauthorized: !shouldUseInsecureTls },
  });

  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[db-migrate] Done. All pending migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db-migrate] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
