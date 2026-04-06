import { NextResponse } from "next/server";
import { getRuntimeProcessorHealth } from "@/lib/privacy/compliance";

/**
 * GET /api/health
 *
 * Used by:
 * - AWS ALB health checks (to decide if this task is healthy)
 * - docker-compose HEALTHCHECK directive
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
