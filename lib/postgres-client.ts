import { Client, type ClientConfig } from "pg";
import dns from "node:dns";

import { env } from "@/lib/env";

dns.setDefaultResultOrder("ipv4first");

function looksLikeSupabasePooler(url: string) {
  return url.includes("pooler.supabase.com") || url.includes(":6543");
}

function getPostgresClientConfig(): ClientConfig {
  if (!env.DATABASE_DIRECT_URL && looksLikeSupabasePooler(env.DATABASE_URL)) {
    throw new Error(
      "DATABASE_DIRECT_URL is required for the outbox relay when DATABASE_URL points to a Supabase pooler.",
    );
  }

  const connectionString = env.DATABASE_DIRECT_URL || env.DATABASE_URL;
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  const shouldUseInsecureTls = env.ALLOW_INSECURE_TLS && !isLocal;

  return {
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: !shouldUseInsecureTls },
  };
}

export function createPostgresClient(): Client {
  return new Client(getPostgresClientConfig());
}
