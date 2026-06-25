type UnknownRecord = Record<string, unknown>;

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ipv4Pattern = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

function scrubString(value: string) {
  return value
    .replace(emailPattern, "[redacted-email]")
    .replace(ipv4Pattern, "[redacted-ip]");
}

function deepScrub(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepScrub(item));
  }

  if (value && typeof value === "object") {
    const next: UnknownRecord = {};
    for (const [key, entry] of Object.entries(value as UnknownRecord)) {
      if (
        key.toLowerCase().includes("authorization") ||
        key.toLowerCase().includes("cookie") ||
        key.toLowerCase().includes("password") ||
        key.toLowerCase().includes("token")
      ) {
        next[key] = "[redacted]";
      } else {
        next[key] = deepScrub(entry);
      }
    }
    return next;
  }

  return value;
}

export function scrubSentryEvent<T>(event: T): T {
  const next = deepScrub(event) as UnknownRecord;

  delete next.user;

  if (next.request && typeof next.request === "object") {
    const request = next.request as UnknownRecord;
    delete request.cookies;
    if (request.headers && typeof request.headers === "object") {
      request.headers = deepScrub(request.headers);
    }
  }

  return next as T;
}
