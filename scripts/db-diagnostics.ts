import dns from "node:dns/promises";
import net from "node:net";
import { Pool } from "pg";

import {
  buildUnsupportedAppConnectionMessage,
  getConnectionModeAdvice,
  getDatabaseConnectionInfo,
  isSupportedAppConnectionMode,
  maskConnectionString,
} from "@/lib/db/connection-mode";

function readNumberFlag(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tcpConnect(host: string, port: number, timeoutMs: number) {
  return new Promise<number>((resolve, reject) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host, port });

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      const elapsed = Date.now() - startedAt;
      cleanup();
      resolve(elapsed);
    });
    socket.once("timeout", () => {
      cleanup();
      reject(new Error(`TCP connect timed out after ${timeoutMs}ms`));
    });
    socket.once("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

async function timed<T>(label: string, fn: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    const value = await fn();
    console.log(`[ok] ${label}: ${Date.now() - startedAt}ms`);
    return value;
  } catch (error) {
    console.error(`[fail] ${label}: ${Date.now() - startedAt}ms`, {
      error: error instanceof Error ? error.message : String(error),
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined,
    });
    throw error;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Run with: pnpm exec tsx --env-file=.env scripts/db-diagnostics.ts");
  }

  const concurrency = readNumberFlag("concurrency", 12);
  const poolMax = readNumberFlag("pool-max", 5);
  const timeoutMs = readNumberFlag("timeout-ms", 10_000);
  const connectionInfo = getDatabaseConnectionInfo(databaseUrl);
  const url = new URL(databaseUrl);

  console.log("[db-diagnostics] connection");
  console.log({
    url: maskConnectionString(databaseUrl),
    host: connectionInfo.host,
    port: connectionInfo.port,
    user: connectionInfo.user,
    database: connectionInfo.database,
    mode: connectionInfo.mode,
    advice: getConnectionModeAdvice(connectionInfo.mode),
    app_runtime_supported: isSupportedAppConnectionMode(connectionInfo.mode),
    ...(isSupportedAppConnectionMode(connectionInfo.mode)
      ? {}
      : { app_runtime_error: buildUnsupportedAppConnectionMessage(connectionInfo) }),
    concurrency,
    poolMax,
    timeoutMs,
  });

  await timed("dns.lookup(all)", async () => {
    const records = await dns.lookup(url.hostname, { all: true });
    console.log(records);
    return records;
  });

  await timed("tcp connect", () => tcpConnect(url.hostname, connectionInfo.port, timeoutMs));

  const pool = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 5_000,
    ssl: connectionInfo.isLocal
      ? undefined
      : { rejectUnauthorized: process.env.ALLOW_INSECURE_TLS !== "true" },
  });

  pool.on("error", (error) => {
    console.error("[pool idle error]", {
      message: error.message,
      code: "code" in error ? String((error as { code?: unknown }).code) : undefined,
    });
  });

  try {
    await timed("single query", async () => {
      const result = await pool.query(
        "select now() as now, inet_server_addr() as server_addr, inet_server_port() as server_port, pg_backend_pid() as pid",
      );
      console.log(result.rows[0]);
    });

    await timed("named prepared statement", async () => {
      const result = await pool.query({
        name: "convy_db_diagnostics_prepared_statement",
        text: "select $1::int as value",
        values: [1],
      });
      console.log(result.rows[0]);
    });

    await timed("session lookup style prepared query", async () => {
      const result = await pool.query({
        name: "convy_db_diagnostics_session_lookup",
        text: 'select "id" from "sessions" where "token" = $1 limit 1',
        values: ["__codex_session_probe__"],
      });
      console.log({ rowCount: result.rowCount });
    });

    await timed(`concurrent queries (${concurrency})`, async () => {
      const results = await Promise.all(
        Array.from({ length: concurrency }, async (_, index) => {
          const startedAt = Date.now();
          const result = await pool.query("select pg_backend_pid() as pid, $1::int as query_index", [index]);
          return {
            index,
            pid: result.rows[0]?.pid,
            elapsedMs: Date.now() - startedAt,
          };
        }),
      );
      console.table(results);
    });

    if (connectionInfo.mode === "supabase-transaction-pooler") {
      console.warn(
        "[db-diagnostics] DATABASE_URL appears to use Supabase transaction pooler. If Drizzle/node-postgres uses prepared statements against this URL, switch to session pooler/direct connection for this app or change the driver strategy.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db-diagnostics] failed", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exitCode = 1;
});
