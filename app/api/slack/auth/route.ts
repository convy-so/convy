import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

/**
 * GET /api/slack/auth
 * Initiates Slack OAuth flow
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedSession();

    if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) {
      return NextResponse.json(
        {
          success: false,
          error: "Slack OAuth is not configured. Please contact administrator.",
        },
        { status: 500 }
      );
    }

    const state = crypto.randomUUID();

    // Slack OAuth 2.0 authorization URL
    const authUrl = new URL("https://slack.com/oauth/v2/authorize");
    authUrl.searchParams.set("client_id", env.SLACK_CLIENT_ID);
    authUrl.searchParams.set(
      "scope",
      "chat:write,channels:read,groups:read,chat:write.public"
    );
    authUrl.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    console.log("Redirecting to Slack OAuth:", {
      userId: session.user.id,
      state,
    });

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("Failed to initiate Slack OAuth:", error);
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?slack_error=auth_failed`
    );
  }
}
