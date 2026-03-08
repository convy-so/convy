import { Worker } from "bullmq";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  analyticsChatSessions,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import type { GenerativeSummaryJobData } from "@/lib/queue";

const SESSION_TITLE = "Automated Generative Summary";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "internal-worker-secret";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

/**
 * Worker: generative-summary
 *
 * Triggered via enqueueGenerativeSummary() in lib/queue.ts, which implements
 * a 2-minute debounce + 15-minute max-wait trickle protector.
 *
 * Steps:
 * 1. Idempotency check: abort if no new responses since last generation.
 * 2. Fetch survey's existing session (or create one) for context.
 * 3. POST to the generative route as a background system refresh.
 * 4. Update lastProcessedResponseCount in the DB.
 * 5. Publish "new-summary-ready" to Redis pub/sub for WebSocket broadcast.
 */
const worker = new Worker<GenerativeSummaryJobData>(
  "generative-summary",
  async (job) => {
    const { surveyId } = job.data;

    // ─── 1. Count current completed + partial responses ───────────────────
    const [{ value: currentCount }] = await getDb()
      .select({ value: count() })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    // ─── 2. Idempotency check ─────────────────────────────────────────────
    const [session] = await getDb()
      .select()
      .from(analyticsChatSessions)
      .where(
        and(
          eq(analyticsChatSessions.surveyId, surveyId),
          eq(analyticsChatSessions.title, SESSION_TITLE),
        ),
      )
      .limit(1);

    if (session && session.lastProcessedResponseCount === currentCount) {
      console.log(
        `[gen-summary] No new responses for survey ${surveyId} (count: ${currentCount}). Skipping.`,
      );
      return; // Do NOT burn AI tokens
    }

    // ─── 3. Verify survey exists ──────────────────────────────────────────
    const [survey] = await getDb()
      .select({ id: surveys.id, userId: surveys.userId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!survey) {
      console.warn(`[gen-summary] Survey ${surveyId} not found. Skipping.`);
      return;
    }

    // ─── 4. Call the Generative Analytics API route ───────────────────────
    // We POST as a system refresh message. The route handles all AI streaming,
    // tool calls (charts/tables), and saves the result to analyticsChatSessions.
    const refreshMessage = {
      id: `worker-refresh-${Date.now()}`,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: "Background refresh: Check for new response data and update the summary. Specifically note what has changed since your previous summary — any new trends, shifts in sentiment, or milestone response counts.",
        },
      ],
    };

    // Build message history: existing session messages + new refresh message
    const existingMessages = Array.isArray(session?.messages)
      ? session.messages
      : [];
    const messages = [...existingMessages, refreshMessage];

    const response = await fetch(
      `${BASE_URL}/api/surveys/${surveyId}/analytics/generative`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Internal auth header — validated in the generative route
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ messages }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(
        `[gen-summary] Generative API responded ${response.status}: ${errorText}`,
      );
    }

    // Drain the stream fully (AI writes to DB in its onFinish callback)
    await response.text();

    // ─── 5. Update Intelligence Delta counter ─────────────────────────────
    if (session) {
      await getDb()
        .update(analyticsChatSessions)
        .set({ lastProcessedResponseCount: currentCount })
        .where(
          and(
            eq(analyticsChatSessions.surveyId, surveyId),
            eq(analyticsChatSessions.title, SESSION_TITLE),
          ),
        );
    }

    // ─── 6. Notify frontend via Redis pub/sub ─────────────────────────────
    // The Next.js WebSocket server subscribes to this channel and broadcasts
    // the event to any connected clients viewing this survey's analytics page.
    const redis = getRedisClient();
    await redis.publish(
      `survey:${surveyId}:analytics`,
      JSON.stringify({ event: "new-summary-ready", surveyId }),
    );

    console.log(
      `[gen-summary] Completed for survey ${surveyId}. Responses at generation: ${currentCount}.`,
    );
  },
  {
    connection: getRedisClient(),
    concurrency: 3, // Process up to 3 surveys simultaneously
  },
);

worker.on("completed", (job) => {
  console.log(`[gen-summary] Job ${job.id} completed.`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[gen-summary] Job ${job?.id} (survey: ${job?.data.surveyId}) failed:`,
    err.message,
  );
});

worker.on("error", (err) => {
  console.error("[gen-summary] Worker error:", err);
});

export default worker;
