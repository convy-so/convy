import { getVerifiedSession } from "@/lib/auth/session";
import { getRedisClient } from "@/lib/redis";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

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
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(
      error,
      "Failed to generate WebSocket token",
      "/api/auth/token",
    );
  }
}
