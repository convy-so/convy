/**
 * Zapier API Key Management Endpoint
 * 
 * This endpoint allows users to manage their Zapier API keys.
 * Used for authentication when Zapier makes requests to our API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { zapierIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { id } = await params;

    // Get integration
    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(
        and(
          eq(zapierIntegrations.id, id),
          eq(zapierIntegrations.userId, session.user.id)
        )
      );

    if (!integration) {
      return NextResponse.json(
        {
          status: "error",
          message: "Integration not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "success",
      data: {
        id: integration.id,
        enabled: integration.enabled,
        lastUsedAt: integration.lastUsedAt,
        createdAt: integration.createdAt,
      },
    });
  } catch (error) {
    console.error("Zapier key get error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to get key",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { id } = await params;

    // Verify ownership
    const [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(
        and(
          eq(zapierIntegrations.id, id),
          eq(zapierIntegrations.userId, session.user.id)
        )
      );

    if (!integration) {
      return NextResponse.json(
        {
          status: "error",
          message: "Integration not found",
        },
        { status: 404 }
      );
    }

    // Delete integration (cascade will delete subscriptions)
    await db
      .delete(zapierIntegrations)
      .where(eq(zapierIntegrations.id, id));

    return NextResponse.json({
      status: "success",
      message: "Integration deleted",
    });
  } catch (error) {
    console.error("Zapier key delete error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to delete key",
      },
      { status: 500 }
    );
  }
}

