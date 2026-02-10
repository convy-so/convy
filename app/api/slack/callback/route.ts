import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { db } from "@/db";
import { slackIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { getSlackWorkspaceInfo } from "@/lib/slack/client";
import { getRedisClient } from "@/lib/redis";

/**
 * GET /api/slack/callback
 * Handles Slack OAuth callback
 */
export async function GET(req: NextRequest) {
  // TEMPORARY: Slack integration is disabled
  return NextResponse.redirect(
    `${process.env.BETTER_AUTH_URL}/dashboard/integrations?slack_error=Feature temporarily disabled. Coming soon!`
  );
  
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

    if (!code) {
      console.error("No authorization code received");
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=no_code`
      );
    }

    if (!state) {
      console.error("No state parameter received");
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=no_state`
      );
    }

    // Verify state matches stored state for CSRF protection
    const redis = getRedisClient();
    const stateKey = `slack:oauth:state:${state}`;
    const storedStateData = await redis.get(stateKey);

    if (!storedStateData) {
      console.error("Invalid or expired state parameter:", {
        state,
        userId: session.user.id,
      });
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=invalid_state`
      );
    }

    let stateData: { userId: string; createdAt: string };
    try {
      stateData = JSON.parse(storedStateData);
    } catch (error) {
      console.error("Failed to parse stored state data:", error);
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=invalid_state`
      );
    }

    // Verify the state belongs to the current user
    if (stateData.userId !== session.user.id) {
      console.error("State user ID mismatch:", {
        stateUserId: stateData.userId,
        sessionUserId: session.user.id,
        state,
      });
      // Delete the state to prevent reuse
      await redis.del(stateKey);
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?slack_error=user_mismatch`
      );
    }

    // Delete the state after successful verification (one-time use)
    await redis.del(stateKey);

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
