/**
 * Move Tagger
 *
 * Breaks a conversation into atomic (AI question + participant response) pairs,
 * computes per-move richness signals, and persists them to `conversation_moves`.
 *
 * This is the core attribution unit — it lets us credit a specific technique
 * for a specific outcome rather than attributing everything to the conversation.
 */

import { nanoid } from "nanoid";
import { db } from "@/db";
import { conversationMoves } from "@/db/schema/learning";
import { surveyConversations } from "@/db/schema/surveys";
import { eq } from "drizzle-orm";
import type { ConversationSignals } from "./signal-collection";

export interface ConversationMove {
  id: string;
  conversationId: string;
  surveyId: string;
  turnIndex: number;
  aiQuestion: string;
  participantResponse: string;
  phase: "opening" | "exploration" | "deepdive" | "closing";
  responseWordCount: number;
  responseRichnessScore: number;
  ledToAbandonment: boolean;
  participantStyleAtTurn: string | null;
  topicsDiscussedSoFar: string[];
}

interface RawMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Tag conversation moves and persist to DB.
 * Returns the list of moves for use by the pattern extractor.
 */
export async function tagConversationMoves(
  conversationId: string,
  surveyId: string,
  signals: ConversationSignals
): Promise<ConversationMove[]> {
  const [conv] = await db
    .select({ rawConversation: surveyConversations.rawConversation })
    .from(surveyConversations)
    .where(eq(surveyConversations.id, conversationId))
    .limit(1);

  if (!conv) throw new Error(`[MoveTagger] Conversation ${conversationId} not found`);

  const messages = (conv.rawConversation as RawMessage[]) || [];

  // Pair up AI message with the following user response
  const moves: ConversationMove[] = [];
  let topicsAccumulated: string[] = [];
  let aiTurnIndex = 0;

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];

    if (msg.role !== "assistant" || next.role !== "user") continue;

    const aiQuestion = msg.content;
    const participantResponse = next.content;

    const responseWordCount = participantResponse.trim().split(/\s+/).length;
    const responseRichnessScore = computeMoveRichness(participantResponse);

    // A move led to abandonment only if it was the last AI message and
    // the conversation was not completed
    const isLastAiMessage = !messages.slice(i + 2).some((m) => m.role === "assistant");
    const ledToAbandonment = isLastAiMessage && signals.completionRate < 1;

    // Infer phase from turn position
    const totalAiTurns = messages.filter((m) => m.role === "assistant").length;
    const phase = inferPhase(aiTurnIndex, totalAiTurns);

    // Accumulate rough topic tracking from participant responses (first 5 words as signal)
    const topicHint = participantResponse.trim().split(/\s+/).slice(0, 5).join(" ");
    if (responseWordCount > 3) topicsAccumulated = [...topicsAccumulated, topicHint].slice(-10);

    const move: ConversationMove = {
      id: nanoid(),
      conversationId,
      surveyId,
      turnIndex: aiTurnIndex,
      aiQuestion,
      participantResponse,
      phase,
      responseWordCount,
      responseRichnessScore,
      ledToAbandonment,
      participantStyleAtTurn: signals.detectedStyle,
      topicsDiscussedSoFar: [...topicsAccumulated],
    };

    moves.push(move);
    aiTurnIndex++;
  }

  // Bulk insert
  if (moves.length > 0) {
    await db.insert(conversationMoves).values(
      moves.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        surveyId: m.surveyId,
        turnIndex: m.turnIndex,
        aiQuestion: m.aiQuestion,
        participantResponse: m.participantResponse,
        phase: m.phase,
        responseWordCount: m.responseWordCount,
        responseRichnessScore: m.responseRichnessScore,
        ledToAbandonment: m.ledToAbandonment,
        participantStyleAtTurn: m.participantStyleAtTurn,
        topicsDiscussedSoFar: m.topicsDiscussedSoFar,
      }))
    );
  }

  console.log(
    `[MoveTagger] conversation=${conversationId} tagged ${moves.length} moves ` +
      `(${moves.filter((m) => m.ledToAbandonment).length} abandonment leads)`
  );

  return moves;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Richness 0-1: proxy combining word count, sentence variety, and unique word ratio */
function computeMoveRichness(text: string): number {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return 0;
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const wordCountNorm = Math.min(1, words.length / 60);
  const sentenceVariety = Math.min(1, sentences.length / 4);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const uniqueRatio = uniqueWords / words.length;
  return wordCountNorm * 0.5 + sentenceVariety * 0.25 + uniqueRatio * 0.25;
}

/**
 * Infer conversation phase from where this AI turn falls in the total arc.
 * opening (0-15%) | exploration (15-55%) | deepdive (55-85%) | closing (85-100%)
 */
function inferPhase(
  turnIndex: number,
  totalTurns: number
): "opening" | "exploration" | "deepdive" | "closing" {
  if (totalTurns === 0) return "opening";
  const pct = turnIndex / totalTurns;
  if (pct < 0.15) return "opening";
  if (pct < 0.55) return "exploration";
  if (pct < 0.85) return "deepdive";
  return "closing";
}
