import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { traceRuns } from "@/db/schema";

export async function recordEducationTrace(input: {
  surveyId?: string | null;
  sessionId?: string | null;
  traceType: string;
  status?: string;
  payload: Record<string, unknown>;
}) {
  try {
    await getDb().insert(traceRuns).values({
      id: nanoid(),
      surveyId: input.surveyId ?? null,
      sessionId: input.sessionId ?? null,
      traceType: input.traceType,
      status: input.status ?? "ok",
      payload: input.payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("[Education Trace] Failed to persist trace:", error);
  }
}
