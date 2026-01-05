/**
 * Zapier REST Hook Authentication Endpoint
 * 
 * This endpoint handles authentication for Zapier's REST hook integration.
 * Zapier will call this to verify the connection and get authentication details.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { zapierIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedSession();

    // Check if user has Zapier integration
    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, session.user.id));

    if (!integration) {
      // Create integration if it doesn't exist
      const newIntegration = await db.insert(zapierIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        enabled: true,
      }).returning();

      return NextResponse.json({
        status: "success",
        data: {
          access_token: newIntegration[0].id, // Use integration ID as access token
          token_type: "Bearer",
        },
      });
    }

    return NextResponse.json({
      status: "success",
      data: {
        access_token: integration.id,
        token_type: "Bearer",
      },
    });
  } catch (error) {
    console.error("Zapier auth error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Authentication failed",
      },
      { status: 401 }
    );
  }
}

