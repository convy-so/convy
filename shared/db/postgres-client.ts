import { Client, type ClientConfig } from "pg";
import dns from "node:dns";

import { getDatabaseConnectionInfo } from "@/shared/db/connection-mode";
import { env } from "@/shared/config/server-env";

dns.setDefaultResultOrder("ipv4first");

function getPostgresClientConfig(): ClientConfig {
  const connectionInfo = getDatabaseConnectionInfo(env.DATABASE_URL);

  if (!env.DATABASE_DIRECT_URL && connectionInfo.mode === "supabase-transaction-pooler") {
    throw new Error(
      "DATABASE_DIRECT_URL is required for the outbox relay when DATABASE_URL points to the Supabase transaction pooler (:6543).",
    );
  }

  const connectionString = env.DATABASE_DIRECT_URL || env.DATABASE_URL;
  const targetConnectionInfo = getDatabaseConnectionInfo(connectionString);

  const shouldUseInsecureTls = env.ALLOW_INSECURE_TLS && !targetConnectionInfo.isLocal;

  return {
    connectionString,
    ssl: targetConnectionInfo.isLocal
      ? undefined
      : { rejectUnauthorized: !shouldUseInsecureTls },
  };
}

export function createPostgresClient(): Client {
  return new Client(getPostgresClientConfig());
}
