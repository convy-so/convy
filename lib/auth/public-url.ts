import "server-only";

import { env } from "@/lib/env";

/** Public browser-facing origin (never 0.0.0.0 — that is a bind address, not a URL). */
export function getPublicAppBaseUrl(): string {
  return (env.APP_BASE_URL || env.BETTER_AUTH_URL).replace(/\/$/, "");
}

export function resolvePublicRedirectUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${getPublicAppBaseUrl()}/`);
}
