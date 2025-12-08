/**
 * Notion OAuth - Handle callback
 *
 * This endpoint receives the authorization code from Notion,
 * exchanges it for an access token, and stores it securely
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";
import { initializeNotionStructure } from "@/lib/notion-oauth";

export async function GET(req: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getVerifiedSession();

    // Get OAuth parameters
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      console.error("Notion OAuth error:", error);
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?notion_error=${error}`
      );
    }

    // Validate code
    if (!code) {
      console.error("No authorization code received");
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?notion_error=no_code`
      );
    }

    // TODO: Verify state matches stored state

    console.log("Exchanging code for access token:", {
      userId: session.user.id,
      hasCode: !!code,
    });

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(
        `${env.BETTER_AUTH_URL}/dashboard?notion_error=token_exchange_failed`
      );
    }

    const tokenData = await tokenResponse.json();

    console.log("Access token received:", {
      userId: session.user.id,
      workspaceId: tokenData.workspace_id,
      workspaceName: tokenData.workspace_name,
    });

    // Encrypt the access token
    const encryptedToken = encrypt(tokenData.access_token);

    // Check if integration already exists
    const [existing] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (existing) {
      // Update existing integration
      console.log("Updating existing Notion integration:", {
        userId: session.user.id,
        integrationId: existing.id,
      });

      await db
        .update(notionIntegrations)
        .set({
          accessToken: encryptedToken.encrypted,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          tokenType: tokenData.token_type,
          owner: tokenData.owner,
          duplicatedTemplateId: tokenData.duplicated_template_id,
          requestId: tokenData.request_id,
          updatedAt: new Date(),
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      // Create new integration
      console.log("Creating new Notion integration:", {
        userId: session.user.id,
      });

      await db.insert(notionIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        accessToken: encryptedToken.encrypted,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.tag,
        botId: tokenData.bot_id,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        tokenType: tokenData.token_type,
        owner: tokenData.owner,
        duplicatedTemplateId: tokenData.duplicated_template_id,
        requestId: tokenData.request_id,
      });
    }

    // Initialize Notion structure (create parent page, database)
    try {
      await initializeNotionStructure(session.user.id, tokenData.access_token);
      console.log("Notion structure initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Notion structure:", error);
    }

    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_success=true`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_error=unknown`
    );
  }
}
