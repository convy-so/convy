/**
 * GET /api/internal/agent-performance
 *
 * Returns the latest agent performance snapshot.
 * Internal endpoint — secured by checking for a server-side API secret.
 * The dashboard or monitoring tool calls this to display learning health.
 */

import { NextResponse } from "next/server";
import { buildPerformanceSnapshot } from "@/lib/learning/performance-monitor";

export async function GET(request: Request) {
  // Basic API secret guard — prevents public access to internal stats
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.INTERNAL_API_SECRET;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await buildPerformanceSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[AgentPerformanceAPI] Failed to build snapshot:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
