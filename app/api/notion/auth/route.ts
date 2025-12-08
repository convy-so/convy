/**
 * Notion OAuth - Initiate authorization flow
 *
 * This endpoint redirects users to Notion's authorization page
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getVerifiedSession();

    // Check if OAuth is configured
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

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    // TODO: Store state in Redis with user ID for verification
    // For now, we'll verify the session exists on callback

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
