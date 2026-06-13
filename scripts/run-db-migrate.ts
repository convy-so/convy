/**
 * Apply pending Drizzle SQL migrations from db/migrations/.
 *
 * Uses DATABASE_URL (Supabase session pooler) by default — reliable from EC2/IPv4.
 * Override with DB_MIGRATE_URL or DATABASE_DIRECT_URL if needed.
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
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MIGRATIONS_SCHEMA = "public";

function resolveDatabaseUrl(): string {
  const url =
    process.env.DB_MIGRATE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_DIRECT_URL;

  if (!url) {
    throw new Error(
      "Missing DATABASE_URL (or DB_MIGRATE_URL / DATABASE_DIRECT_URL). Set it in .env.prod.",
    );
  }

  return url;
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts = [error.message];
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (
      current &&
      typeof current === "object" &&
      "cause" in current &&
      current.cause
    ) {
      current = current.cause;
      if (current instanceof Error) {
        parts.push(`cause: ${current.message}`);
      } else {
        parts.push(`cause: ${String(current)}`);
      }
    } else {
      break;
    }
  }

  return parts.join(" | ");
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

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const connectionInfo = getDatabaseConnectionInfo(databaseUrl);
  const migrationFiles = listSqlMigrationFiles();

  console.log("[db-migrate] connection:", maskConnectionString(databaseUrl));
  console.log("[db-migrate] mode:", connectionInfo.mode);
  console.log("[db-migrate] migrations folder:", MIGRATIONS_FOLDER);
  console.log(
    `[db-migrate] tracking table: ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  );

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
    await ensureMigrationsTable(pool);

    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsTable: MIGRATIONS_TABLE,
      migrationsSchema: MIGRATIONS_SCHEMA,
    });
    console.log("[db-migrate] Done. All pending migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db-migrate] Failed:", formatError(error));
  process.exit(1);
});
