import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${env.APP_BASE_URL}/`);
  }

  const redis = getRedisClient();
  const email = await redis.get(`admin_login:${token}`);

  if (!email) {
    return NextResponse.redirect(`${env.APP_BASE_URL}/`);
  }

  // Valid token, create a session
  await redis.del(`admin_login:${token}`);
  const sessionToken = randomUUID();
  
  // Store session for 7 days
  await redis.set(`admin_session:${sessionToken}`, email, "EX", 7 * 24 * 60 * 60);

  // Create response and set cookie
  const response = NextResponse.redirect(`${env.APP_BASE_URL}/en/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI`);
  
  response.cookies.set("admin_session", sessionToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
