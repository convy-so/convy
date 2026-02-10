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
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  // TEMPORARY: Zapier integration is disabled
  return NextResponse.json(
    {
      status: "error",
      message: "Zapier integration is temporarily disabled. Coming soon!",
    },
    { status: 503 }
  );
  
  try {
    const session = await getVerifiedSession();

    // Check if user has Zapier integration
    const [integration] = await db
      .select()
      .from(zapierIntegrations)

      .where(eq(zapierIntegrations.userId, session.user.id));

    if (!integration) {
      // Create integration if it doesn't exist
      const apiKey = `zv_${nanoid(32)}`; // Zapier-specific prefix
      const newIntegration = await db.insert(zapierIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        apiKey,
        enabled: true,
      }).returning();

      return NextResponse.json({
        status: "success",
        data: {
          access_token: newIntegration[0].apiKey, 
          token_type: "Bearer",
        },
      });
    }

    // If integration exists but no API key (migration), generate one
    if (!integration.apiKey) {
         const apiKey = `zv_${nanoid(32)}`;
         await db.update(zapierIntegrations)
           .set({ apiKey })
           .where(eq(zapierIntegrations.id, integration.id));
           
         return NextResponse.json({
            status: "success",
            data: {
              access_token: apiKey,
              token_type: "Bearer",
            },
          });
    }

    return NextResponse.json({
      status: "success",
      data: {
        access_token: integration.apiKey,
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

