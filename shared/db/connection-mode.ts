export type ConnectionMode =
  | "supabase-direct"
  | "supabase-session-pooler"
  | "supabase-transaction-pooler"
  | "supabase-pooler-unknown"
  | "other";

export type DatabaseConnectionInfo = {
  rawUrl: string;
  host: string;
  port: number;
  user: string;
  database: string;
  mode: ConnectionMode;
  isLocal: boolean;
};

export function maskConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "********";
    return url.toString();
  } catch {
    return "<invalid connection string>";
  }
}

export function classifyConnectionMode(url: URL): ConnectionMode {
  const host = url.hostname;
  const port = url.port || "5432";

  if (host.includes("pooler.supabase.com")) {
    if (port === "6543") return "supabase-transaction-pooler";
    if (port === "5432") return "supabase-session-pooler";
    return "supabase-pooler-unknown";
  }

  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    return "supabase-direct";
  }

  return "other";
}

export function getDatabaseConnectionInfo(rawUrl: string): DatabaseConnectionInfo {
  const url = new URL(rawUrl);
  const host = url.hostname;
  const port = Number(url.port || 5432);

  return {
    rawUrl,
    host,
    port,
    user: url.username,
    database: url.pathname.replace(/^\//, ""),
    mode: classifyConnectionMode(url),
    isLocal: ["localhost", "127.0.0.1", "::1"].includes(host),
  };
}

export function getConnectionModeAdvice(mode: ConnectionMode) {
  switch (mode) {
    case "supabase-direct":
      return "Direct Supabase connection. Preferred for persistent servers when IPv6/network support is available.";
    case "supabase-session-pooler":
      return "Supabase session pooler. Recommended for persistent Node servers when direct IPv6 access is unavailable.";
    case "supabase-transaction-pooler":
      return "Supabase transaction pooler. Intended for transient/serverless workloads and does not support prepared statements reliably for this app.";
    case "supabase-pooler-unknown":
      return "Supabase pooler host with an unexpected port. Verify the connection string in the Supabase dashboard.";
    default:
      return "Non-Supabase or unrecognized Postgres host.";
  }
}

export function isSupportedAppConnectionMode(mode: ConnectionMode) {
  return mode !== "supabase-transaction-pooler";
}

export function buildUnsupportedAppConnectionMessage(info: DatabaseConnectionInfo) {
  return [
    "Unsupported DATABASE_URL for the Next.js app runtime.",
    `Detected ${info.mode} at ${info.host}:${info.port}.`,
    "This app uses node-postgres and Drizzle prepared queries for Better Auth session lookups.",
    "Use the Supabase session pooler on port 5432 for free-tier persistent server access.",
  ].join(" ");
}
