import type { IncomingHttpHeaders } from "http";

type HeaderValue = string | string[] | null | undefined;

type HeaderSource =
  | Headers
  | IncomingHttpHeaders
  | {
      get?(name: string): string | null;
      [key: string]: unknown;
    };

export type TrustedClientIpResult = {
  ip: string | null;
  source: "trusted_proxy" | "socket" | "untrusted_forwarded" | "unavailable";
  trustedProxy: boolean;
};

const TRUSTED_PROXY_SIGNATURE_HEADERS = [
  "x-vercel-id",
  "cf-ray",
  "x-amzn-trace-id",
] as const;

function readHeader(headers: HeaderSource, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return typeof value === "string" ? value : null;
  }

  const candidate = (headers as IncomingHttpHeaders)[name.toLowerCase()];
  if (Array.isArray(candidate)) {
    return candidate[0] ?? null;
  }

  return typeof candidate === "string" ? candidate : null;
}

function hasTrustedProxySignature(headers: HeaderSource) {
  return TRUSTED_PROXY_SIGNATURE_HEADERS.some((header) =>
    Boolean(readHeader(headers, header)),
  );
}

function stripIpPort(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const closingIndex = trimmed.indexOf("]");
    return closingIndex > 1 ? trimmed.slice(1, closingIndex) : null;
  }

  const colonCount = (trimmed.match(/:/g) || []).length;
  if (colonCount === 1 && trimmed.includes(".")) {
    return trimmed.split(":")[0] ?? null;
  }

  return trimmed;
}

function getFirstForwardedIp(value: HeaderValue) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;

  return stripIpPort(raw.split(",")[0] ?? "");
}

function normalizeSocketIp(value: string | undefined | null) {
  if (!value) return null;
  if (value === "::1") return "127.0.0.1";
  if (value.startsWith("::ffff:")) return value.slice("::ffff:".length);
  return stripIpPort(value);
}

export function resolveTrustedClientIp(headers: HeaderSource): TrustedClientIpResult {
  const trustedProxy = hasTrustedProxySignature(headers);
  const forwardedIp = getFirstForwardedIp(readHeader(headers, "x-forwarded-for"));
  const realIp = stripIpPort(readHeader(headers, "x-real-ip") ?? "");
  const cloudflareIp = stripIpPort(readHeader(headers, "cf-connecting-ip") ?? "");

  if (trustedProxy) {
    return {
      ip: forwardedIp ?? realIp ?? cloudflareIp,
      source: "trusted_proxy",
      trustedProxy: true,
    };
  }

  if (forwardedIp || realIp || cloudflareIp) {
    return {
      ip: null,
      source: "untrusted_forwarded",
      trustedProxy: false,
    };
  }

  return {
    ip: null,
    source: "unavailable",
    trustedProxy: false,
  };
}

export function resolveTrustedNodeClientIp(input: {
  headers: IncomingHttpHeaders;
  socketRemoteAddress?: string | null;
}): TrustedClientIpResult {
  const fromHeaders = resolveTrustedClientIp(input.headers);
  if (fromHeaders.ip) {
    return fromHeaders;
  }

  const socketIp = normalizeSocketIp(input.socketRemoteAddress);
  if (socketIp) {
    return {
      ip: socketIp,
      source: "socket",
      trustedProxy: false,
    };
  }

  return fromHeaders;
}

export function getClientIP(request: Request): string {
  const result = resolveTrustedClientIp(request.headers);
  return result.ip ?? "unknown";
}
