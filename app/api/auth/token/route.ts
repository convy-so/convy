import { auth } from "@/lib/auth";
import { getRedisClient } from "@/lib/redis";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  const redis = getRedisClient();
  const ticket = `ws_${randomUUID()}`;

  // Short-lived one-time WebSocket auth ticket to avoid exposing long-lived session tokens.
  await redis.set(`ws_ticket:${ticket}`, session.session.token, "EX", 30);

  const response = NextResponse.json({ token: ticket });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
