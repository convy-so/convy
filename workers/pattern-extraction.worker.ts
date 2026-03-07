/**
 * Pattern Extraction Worker — Updated
 *
 * New pipeline:
 *  1. collectConversationSignals()  — objective ground-truth metrics
 *  2. tagConversationMoves()        — atomic move attribution
 *  3. Discomfort veto check         — abort if participant flagged discomfort
 *  4. extractPatterns()             — LLM names patterns, guided by move evidence
 *  5. storePatterns()               — persists as CANDIDATE
 */

import { Worker, Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  surveyConversations,
  surveyCreationConversations,
  sampleConversations,
  surveys,
} from "@/db/schema";
import { participantFeedback } from "@/db/schema/learning";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { getRedisClient } from "@/lib/redis";
import type { PatternExtractionJobData } from "@/lib/queue";
import {
  extractPatternsFromConversation,
  extractCreationPatterns,
  type PatternExtractionResult,
} from "@/lib/learning/pattern-extraction";
import { storePatterns } from "@/lib/learning/knowledge-storage";
import { collectConversationSignals } from "@/lib/learning/signal-collection";
import { tagConversationMoves } from "@/lib/learning/move-tagger";

const jobDataSchema = z.object({
  conversationId: z.string().min(1),
  surveyId: z.string().min(1),
  conversationType: z.enum(["creation", "response", "sample"]),
  domainId: z.number().nullable().optional(),
});

const patternExtractionWorker = new Worker<PatternExtractionJobData>(
  "pattern-extraction",
  async (job: Job<PatternExtractionJobData>) => {
    const { conversationId, surveyId, conversationType, domainId } =
      jobDataSchema.parse(job.data);

    console.log(
      `[PatternExtractionWorker] Starting job ${job.id} — ${conversationType} conversation ${conversationId}`,
    );
    await job.updateProgress(5);

    // ── Load survey ──────────────────────────────────────────────────────────
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    if (!survey) throw new Error(`Survey ${surveyId} not found`);

    const surveyConfig = buildCompleteSurveyConfig(survey);
    const finalDomainId = domainId ?? survey.domainId ?? null;
    await job.updateProgress(10);

    // ── Creation conversations bypass signal/move collection ─────────────────
    if (conversationType === "creation") {
      const [creationConv] = await getDb()
        .select()
        .from(surveyCreationConversations)
        .where(eq(surveyCreationConversations.surveyId, surveyId));

      if (!creationConv?.messages || creationConv.messages.length < 4) {
        console.log(
          `[PatternExtractionWorker] Skipping — insufficient messages`,
        );
        return { stored: 0, skipped: 0, updated: 0 };
      }

      await job.updateProgress(40);

      const result = await extractCreationPatterns(
        creationConv.messages as Array<{
          role: "user" | "assistant";
          content: string;
        }>,
        creationConv.extractedData || {},
        {
          conversationId: creationConv.id,
          surveyId,
          domainId: finalDomainId ?? undefined,
        },
      );

      await job.updateProgress(80);
      const stored = await storePatterns([
        ...result.successfulPatterns,
        ...result.failedPatterns,
      ]);
      await job.updateProgress(100);
      return stored;
    }

    // ── PHASE 1: Collect objective signals ───────────────────────────────────
    let signals: Awaited<ReturnType<typeof collectConversationSignals>>;
    try {
      signals = await collectConversationSignals(
        conversationId,
        surveyId,
        surveyConfig,
      );
    } catch (err) {
      console.error(`[PatternExtractionWorker] Signal collection failed:`, err);
      return { stored: 0, skipped: 1, updated: 0 };
    }
    await job.updateProgress(30);

    // ── PHASE 2: Tag conversation moves ──────────────────────────────────────
    let moves: Awaited<ReturnType<typeof tagConversationMoves>>;
    try {
      moves = await tagConversationMoves(conversationId, surveyId, signals);
    } catch (err) {
      console.error(`[PatternExtractionWorker] Move tagging failed:`, err);
      moves = [];
    }
    await job.updateProgress(50);

    // ── PHASE 3: Discomfort veto ─────────────────────────────────────────────
    const [discomfortRecord] = await getDb()
      .select({ id: participantFeedback.id })
      .from(participantFeedback)
      .where(
        and(
          eq(participantFeedback.conversationId, conversationId),
          eq(participantFeedback.uncomfortableTopics, true),
        ),
      )
      .limit(1);

    if (discomfortRecord) {
      console.log(
        `[PatternExtractionWorker] VETO — participant reported discomfort for ${conversationId}. No patterns extracted.`,
      );
      return { stored: 0, skipped: 1, updated: 0, reason: "discomfort_veto" };
    }

    await job.updateProgress(60);

    // ── PHASE 4: Extract patterns using signal evidence ───────────────────────
    let extractionResult: PatternExtractionResult;

    if (conversationType === "sample") {
      const [sampleConv] = await getDb()
        .select()
        .from(sampleConversations)
        .where(eq(sampleConversations.id, conversationId));

      if (!sampleConv?.messages || sampleConv.messages.length < 4) {
        return { stored: 0, skipped: 1, updated: 0 };
      }

      extractionResult = await extractPatternsFromConversation(
        sampleConv.messages as Array<{
          role: "user" | "assistant";
          content: string;
        }>,
        surveyConfig,
        signals,
        moves,
        { conversationId: sampleConv.id, surveyId, conversationType: "sample" },
      );
    } else {
      // response conversation
      const [conversation] = await getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, conversationId));

      if (
        !conversation?.rawConversation ||
        conversation.rawConversation.length < 4
      ) {
        return { stored: 0, skipped: 1, updated: 0 };
      }

      extractionResult = await extractPatternsFromConversation(
        conversation.rawConversation as Array<{
          role: "user" | "assistant";
          content: string;
        }>,
        surveyConfig,
        signals,
        moves,
        {
          conversationId: conversation.id,
          surveyId,
          conversationType: "response",
        },
      );
    }

    await job.updateProgress(85);

    // ── PHASE 5: Store as CANDIDATE ──────────────────────────────────────────
    const allPatterns = [
      ...extractionResult.successfulPatterns,
      ...extractionResult.failedPatterns,
    ];

    const storageResult = await storePatterns(allPatterns);
    await job.updateProgress(100);

    console.log(
      `[PatternExtractionWorker] Done job ${job.id}: ` +
        `stored=${storageResult.stored} updated=${storageResult.updated} skipped=${storageResult.skipped} ` +
        `(completion=${signals.completionRate.toFixed(2)} coverage=${signals.objectiveCoverageScore.toFixed(2)})`,
    );

    return {
      stored: storageResult.stored,
      updated: storageResult.updated,
      skipped: storageResult.skipped,
      signals: {
        completionRate: signals.completionRate,
        objectiveCoverageScore: signals.objectiveCoverageScore,
        detectedStyle: signals.detectedStyle,
        totalMoves: moves.length,
      },
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 3,
    limiter: { max: 5, duration: 60000 },
  },
);

patternExtractionWorker.on("completed", (job) =>
  console.log(`[PatternExtractionWorker] Job ${job.id} completed`),
);
patternExtractionWorker.on("failed", (job, err) =>
  console.error(
    `[PatternExtractionWorker] Job ${job?.id} failed:`,
    err.message,
  ),
);
patternExtractionWorker.on("error", (err) =>
  console.error("[PatternExtractionWorker] Worker error:", err),
);

export default patternExtractionWorker;
