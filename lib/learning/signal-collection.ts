/**
 * Signal Collection
 *
 * Computes objective, measurable post-conversation signals.
 * These replace LLM-assigned quality scores as the primary ground truth.
 *
 * Key design principle: the only LLM call here uses a FIXED RUBRIC that
 * produces deterministic, auditable JSON — it is not a free-form quality judge.
 */

import { nanoid } from "nanoid";
import { db } from "@/db";
import { conversationSignals } from "@/db/schema/learning";
import { surveyConversations } from "@/db/schema/surveys";
import { eq } from "drizzle-orm";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import type { SurveyConfig } from "@/lib/prompts";

export interface ConversationSignals {
  completionRate: number; // 0-1
  dropoffTurnIndex: number | null;
  totalTurns: number;
  avgWordsPerResponse: number;
  oneWordResponseCount: number;
  offtopicResponseCount: number;
  objectiveCoverageScore: number; // 0-1
  missedObjectives: string[];
  detectedStyle: "verbose" | "concise" | "hesitant" | "neutral" | null;
  styleDetectionConfidence: number | null;
  avgResponseRichnessScore: number;
}

interface RawMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Collect and persist objective signals for a completed conversation.
 * Safe to call multiple times — uses conversationId as a natural idempotency key
 * (subsequent calls will simply insert a second row, so callers should guard).
 */
export async function collectConversationSignals(
  conversationId: string,
  surveyId: string,
  surveyConfig: SurveyConfig,
): Promise<ConversationSignals> {
  // 1. Load raw conversation
  const [conv] = await db
    .select({
      rawConversation: surveyConversations.rawConversation,
      completed: surveyConversations.completed,
    })
    .from(surveyConversations)
    .where(eq(surveyConversations.id, conversationId))
    .limit(1);

  if (!conv)
    throw new Error(
      `[SignalCollection] Conversation ${conversationId} not found`,
    );

  const messages = (conv.rawConversation as RawMessage[]) || [];

  // 2. Compute purely numeric signals
  const aiTurns = messages.filter((m) => m.role === "assistant");
  const participantTurns = messages.filter((m) => m.role === "user");
  const totalTurns = aiTurns.length;

  const wordCounts = participantTurns.map(
    (m) => m.content.trim().split(/\s+/).length,
  );
  const avgWordsPerResponse =
    wordCounts.length > 0
      ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
      : 0;

  const oneWordResponseCount = wordCounts.filter((w) => w <= 1).length;

  // Completion rate: 1.0 if the conversation was marked completed, otherwise
  // the fraction of expected objectives that were at least touched.
  const completionRate = conv.completed ? 1.0 : Math.min(1, totalTurns / 10);
  const dropoffTurnIndex = conv.completed ? null : totalTurns;

  // Basic offtopic heuristic: very short responses after turn 3 (participant gave up)
  const offtopicResponseCount = participantTurns.filter(
    (m, i) => i > 2 && m.content.trim().split(/\s+/).length <= 2,
  ).length;

  // Average richness: word count diversity + sentence count proxy
  const richnessScores = participantTurns.map((m) =>
    computeRichnessScore(m.content),
  );
  const avgResponseRichnessScore =
    richnessScores.length > 0
      ? richnessScores.reduce((a, b) => a + b, 0) / richnessScores.length
      : 0;

  // 3. LLM-based signals with FIXED RUBRIC (deterministic, not free-form)
  const {
    objectiveCoverageScore,
    missedObjectives,
    detectedStyle,
    styleDetectionConfidence,
  } = await runObjectiveCoverageRubric(messages, surveyConfig);

  // 4. Persist to DB
  const signals: ConversationSignals = {
    completionRate,
    dropoffTurnIndex,
    totalTurns,
    avgWordsPerResponse,
    oneWordResponseCount,
    offtopicResponseCount,
    objectiveCoverageScore,
    missedObjectives,
    detectedStyle,
    styleDetectionConfidence,
    avgResponseRichnessScore,
  };

  await db.insert(conversationSignals).values({
    id: nanoid(),
    conversationId,
    surveyId,
    completionRate: signals.completionRate,
    dropoffTurnIndex: signals.dropoffTurnIndex,
    totalTurns: signals.totalTurns,
    avgWordsPerResponse: signals.avgWordsPerResponse,
    oneWordResponseCount: signals.oneWordResponseCount,
    offtopicResponseCount: signals.offtopicResponseCount,
    objectiveCoverageScore: signals.objectiveCoverageScore,
    missedObjectives: signals.missedObjectives,
    detectedStyle: signals.detectedStyle,
    styleDetectionConfidence: signals.styleDetectionConfidence,
    avgResponseRichnessScore: signals.avgResponseRichnessScore,
  });

  console.log(
    `[SignalCollection] conversation=${conversationId} ` +
      `completion=${completionRate.toFixed(2)} objectiveCoverage=${objectiveCoverageScore.toFixed(2)} ` +
      `style=${detectedStyle} avgWords=${avgWordsPerResponse.toFixed(1)}`,
  );

  return signals;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Word-diversity richness proxy: sentence variety + word count normalised 0-1 */
function computeRichnessScore(text: string): number {
  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const wordCountNorm = Math.min(1, words.length / 60); // 60 words = full score
  const sentenceVariety = Math.min(1, sentences.length / 4);
  // Unique word ratio
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const uniqueRatio = words.length > 0 ? uniqueWords / words.length : 0;
  return wordCountNorm * 0.5 + sentenceVariety * 0.25 + uniqueRatio * 0.25;
}

/** Fixed-rubric LLM call — always returns JSON, never free-form essay */
async function runObjectiveCoverageRubric(
  messages: RawMessage[],
  config: SurveyConfig,
): Promise<{
  objectiveCoverageScore: number;
  missedObjectives: string[];
  detectedStyle: "verbose" | "concise" | "hesitant" | "neutral" | null;
  styleDetectionConfidence: number | null;
}> {
  const objectives = [
    config.coreObjective,
    config.expertState?.objective?.goal,
    ...(config.expertState?.scope?.mainTopics ?? []),
  ].filter(Boolean);

  if (objectives.length === 0) {
    return {
      objectiveCoverageScore: 0.5,
      missedObjectives: [],
      detectedStyle: null,
      styleDetectionConfidence: null,
    };
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "PARTICIPANT" : "AI"}: ${m.content}`)
    .join("\n");

  const prompt = `You are an objective conversation auditor. Score the following survey conversation ONLY based on the provided rubric.

SURVEY OBJECTIVES:
${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

CONVERSATION:
${transcript.slice(0, 3000)}

TASK: Return ONLY a JSON object with exactly these fields — no commentary:
{
  "objectiveCoverageScore": <number 0.0-1.0, fraction of objectives meaningfully addressed>,
  "missedObjectives": [<string, objective not addressed>],
  "detectedStyle": <"verbose"|"concise"|"hesitant"|"neutral">,
  "styleDetectionConfidence": <number 0.0-1.0>
}`;

  try {
    const response = await generateAIResponse(prompt, undefined, {
      model: analysisModel,
      temperature: 0,
      maxTokens: 300,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in rubric response");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      objectiveCoverageScore: Math.min(
        1,
        Math.max(0, Number(parsed.objectiveCoverageScore) || 0),
      ),
      missedObjectives: Array.isArray(parsed.missedObjectives)
        ? parsed.missedObjectives
        : [],
      detectedStyle: ["verbose", "concise", "hesitant", "neutral"].includes(
        parsed.detectedStyle,
      )
        ? parsed.detectedStyle
        : null,
      styleDetectionConfidence: parsed.styleDetectionConfidence
        ? Math.min(1, Math.max(0, Number(parsed.styleDetectionConfidence)))
        : null,
    };
  } catch (err) {
    console.warn(
      "[SignalCollection] Rubric LLM call failed, using defaults:",
      err,
    );
    return {
      objectiveCoverageScore: 0.5,
      missedObjectives: [],
      detectedStyle: null,
      styleDetectionConfidence: null,
    };
  }
}
