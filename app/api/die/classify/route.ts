import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { classifyIntent } from "@/lib/die/domain-intelligence-engine";

const RequestSchema = z.object({
  intentStatement: z.string().min(10).max(2000),
});

/**
 * POST /api/die/classify
 *
 * Runs the Domain Intelligence Engine on a user's research intent statement.
 * Returns a DomainManifest.
 *
 * Used by:
 * - Survey creation flow: called before initializing the Creation agent
 * - Debug tooling
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { intentStatement } = parsed.data;

  try {
    const manifest = await classifyIntent(intentStatement);
    return NextResponse.json({ manifest });
  } catch (err) {
    console.error("[API /die/classify] Error:", err);
    return NextResponse.json(
      { error: "Classification failed", details: String(err) },
      { status: 500 },
    );
  }
}
