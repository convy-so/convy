import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export function getClientIP(request: Request): string {
  const result = resolveTrustedClientIp(request.headers);
  return result.ip ?? "unknown";
}
