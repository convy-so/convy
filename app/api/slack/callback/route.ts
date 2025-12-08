import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { db } from "@/db";
import { slackIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { getSlackWorkspaceInfo } from "@/lib/slack/client";

/**
 * GET /api/slack/callback
 * Handles Slack OAuth callback
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedSession();

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      console.error("Slack OAuth error:", error);
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=${error}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=missing_params`
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID!,
        client_secret: env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange code: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      throw new Error(`Slack OAuth error: ${tokenData.error}`);
    }

    // Encrypt access token
    const encryptedToken = encrypt(tokenData.access_token);

    // Get workspace info
    const workspaceInfo = await getSlackWorkspaceInfo(tokenData.access_token);

    // Check if integration already exists
    const [existing] = await db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.userId, session.user.id));

    if (existing) {
      // Update existing integration
      await db
        .update(slackIntegrations)
        .set({
          accessToken: encryptedToken.encrypted,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          teamId: workspaceInfo.teamId,
          teamName: workspaceInfo.teamName,
          teamIcon: workspaceInfo.teamIcon || null,
          botUserId: workspaceInfo.botUserId || null,
          scope: tokenData.scope,
          tokenType: tokenData.token_type,
          updatedAt: new Date(),
        })
        .where(eq(slackIntegrations.userId, session.user.id));
    } else {
      // Create new integration
      await db.insert(slackIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        accessToken: encryptedToken.encrypted,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.tag,
        teamId: workspaceInfo.teamId,
        teamName: workspaceInfo.teamName,
        teamIcon: workspaceInfo.teamIcon || null,
        botUserId: workspaceInfo.botUserId || null,
        scope: tokenData.scope,
        tokenType: tokenData.token_type,
      });
    }

    console.log("Slack OAuth completed successfully:", {
      userId: session.user.id,
      teamId: workspaceInfo.teamId,
      teamName: workspaceInfo.teamName,
    });

    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?slack_success=true`
    );
  } catch (error) {
    console.error("Slack OAuth callback error:", error);
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?slack_error=callback_failed`
    );
  }
}
