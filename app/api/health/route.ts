import { NextResponse } from "next/server";
import { getRuntimeProcessorHealth } from "@/lib/privacy/compliance";

/**
 * GET /api/health
 *
 * Used by:
 * - load balancer health checks
 * - container health checks
 *
 * Returns 200 OK when the server is running.
 * You can extend this later to check DB connectivity etc.
 */
export async function GET() {
  const processorHealth = getRuntimeProcessorHealth();

  return NextResponse.json(
    {
      status: processorHealth.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      service: "convy-nextjs",
    },
    { status: processorHealth.ok ? 200 : 503 },
  );
}
