import { getVerifiedSession } from "@/features/auth/public-server";
import { getRedisClient } from "@/shared/infra/redis";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiUnhandledError } from "@/shared/http/api-error";
import { toApiAuthError } from "@/features/auth/public-server";

export async function GET() {
  try {
    const session = await getVerifiedSession();

    const redis = getRedisClient();
    const ticket = `ws_${randomUUID()}`;

    await redis.set(`ws_ticket:${ticket}`, session.session.token, "EX", 30);

    const response = NextResponse.json({ token: ticket });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const mapped = toApiAuthError(error);
    if (mapped) return mapped;
    return apiUnhandledError(
      error,
      "Failed to generate WebSocket token",
      "/api/auth/token",
    );
  }
}
