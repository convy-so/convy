import { NextResponse } from "next/server";

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
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "convy-nextjs",
    },
    { status: 200 },
  );
}
