/**
 * Notion OAuth - Initiate authorization flow
 *
 * This endpoint redirects users to Notion's authorization page
 */

import { NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis";

export async function GET() {
  // TEMPORARY: Notion integration is disabled
  return NextResponse.redirect(
    `${process.env.BETTER_AUTH_URL}/dashboard/integrations?notion_error=Feature temporarily disabled. Coming soon!`
  );
  
  try {
    const session = await getVerifiedSession();

    if (!env.NOTION_CLIENT_ID || !env.NOTION_REDIRECT_URI) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Notion OAuth is not configured. Please contact administrator.",
        },
        { status: 500 }
      );
    }

    const state = crypto.randomUUID();

    // Store state in Redis with user ID for verification (10 minute TTL)
    // This prevents CSRF attacks and ensures the callback is for the correct user
    const redis = getRedisClient();
    await redis.setex(
      `notion:oauth:state:${state}`,
      600,
      JSON.stringify({
        userId: session.user.id,
        createdAt: new Date().toISOString(),
      })
    );

    // Build Notion authorization URL
    const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    authUrl.searchParams.set("client_id", env.NOTION_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("owner", "user");
    authUrl.searchParams.set("redirect_uri", env.NOTION_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    console.log("Redirecting to Notion OAuth:", {
      userId: session.user.id,
      state,
    });

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("Failed to initiate Notion OAuth:", error);

    // Redirect back to dashboard with error
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_error=auth_failed`
    );
  }
}
