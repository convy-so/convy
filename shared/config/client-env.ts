"use client";

const optional = (key: string): string | undefined => {
  return process.env[key];
};

/** Prefer the live browser origin so auth works without rebuilding the Docker image. */
function resolvePublicOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return (
    optional("NEXT_PUBLIC_BETTER_AUTH_URL") ||
    optional("NEXT_PUBLIC_APP_URL") ||
    "http://localhost:3000"
  );
}

function resolvePublicAppUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return optional("NEXT_PUBLIC_APP_URL") || "https://getconvy.pro";
}

function resolveWebSocketUrl(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const port = optional("NEXT_PUBLIC_WEBSOCKET_PORT") || "3001";
    return `${wsProtocol}//${window.location.hostname}:${port}`;
  }

  return optional("NEXT_PUBLIC_WEBSOCKET_URL") || "ws://localhost:3001";
}

export const clientEnv = {
  get NEXT_PUBLIC_BETTER_AUTH_URL() {
    return resolvePublicOrigin();
  },

  get NEXT_PUBLIC_APP_URL() {
    return resolvePublicAppUrl();
  },

  get NEXT_PUBLIC_WEBSOCKET_URL() {
    return resolveWebSocketUrl();
  },

  get NEXT_PUBLIC_SUPABASE_URL() {
    return optional("NEXT_PUBLIC_SUPABASE_URL") || "";
  },

  get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY() {
    return optional("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || "";
  },

  get NEXT_PUBLIC_GDPR_EU_MODE() {
    return optional("NEXT_PUBLIC_GDPR_EU_MODE") === "true";
  },

  get NEXT_PUBLIC_SENTRY_DSN() {
    return optional("NEXT_PUBLIC_SENTRY_DSN");
  },
};

export type ClientEnv = typeof clientEnv;
