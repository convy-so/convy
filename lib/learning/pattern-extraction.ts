/**
 * Pattern Extraction System
 *
 * Analyzes completed conversations to extract successful techniques and anti-patterns.
 *
 * KEY CHANGE from previous version:
 * - Quality scores now come from SIGNALS (ConversationSignals), not from LLM self-assessment.
 * - The LLM is used only to NAME and DESCRIBE patterns (pattern-namer), not to judge quality.
 * - Discomfort veto: if participant reported uncomfortable topics, NO patterns are extracted.
 */

import { analysisModel, generateAIResponse } from "@/lib/ai";
import type { SurveyConfig } from "@/lib/prompts";
import type { ConversationSignals } from "./signal-collection";
import type { ConversationMove } from "./move-tagger";

export interface ExtractedPattern {
  type: "technique" | "pattern" | "insight" | "anti-pattern";
  domainId: number | null; // null for general patterns
  category:
    | "questioning"
    | "probing"
    | "transition"
    | "engagement"
    | "creation"
    | "general";
  title: string;
  description: string;
  example: string; // Actual example from conversation
  context: string; // When/why this pattern was effective
  successIndicators: string[]; // Evidence from conversation
  qualityScore: number; // 0-100, signal-backed (not LLM opinion)
  // Situational metadata for context-engine retrieval
  effectivePhase?: "opening" | "exploration" | "deepdive" | "closing";
  effectiveStyle?: "verbose" | "concise" | "hesitant" | "neutral";
  metadata: {
    conversationId: string;
    surveyId: string;
    conversationType: "creation" | "response" | "sample";
    completionRate: number;
    objectiveCoverageScore: number;
    avgResponseRichnessScore: number;
    [key: string]: unknown;
  };
}

export interface PatternExtractionResult {
  successfulPatterns: ExtractedPattern[];
  failedPatterns: ExtractedPattern[]; // Anti-patterns
  domainSpecificLearnings: ExtractedPattern[];
  generalLearnings: ExtractedPattern[];
}

// ---------------------------------------------------------------------------
// Main extraction function (response / sample conversations)
// ---------------------------------------------------------------------------
export async function extractPatternsFromConversation(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig,
  signals: ConversationSignals,
  moves: ConversationMove[],
  metadata: {
    conversationId: string;
    surveyId: string;
    userId?: string;
    conversationType: "creation" | "response" | "sample";
  },
): Promise<PatternExtractionResult> {
  // ── Discomfort veto ──────────────────────────────────────────────────────
  // This veto is checked before calling this function in the worker,
  // but we double-check here as a safety net.
  if (
    signals.completionRate < 0.1 &&
    signals.oneWordResponseCount > signals.totalTurns * 0.5
  ) {
    console.log(
      `[PatternExtraction] Skipping — extremely low engagement (likely spam/bot): ${metadata.conversationId}`,
    );
    return emptyResult();
  }

  const conversationText = conversation
    .map(
      (msg, i) =>
        `[${i + 1}] ${msg.role === "user" ? "PARTICIPANT" : "AI"}: ${msg.content}`,
    )
    .join("\n\n");

  const domainName = config.domainId ? `Domain ${config.domainId}` : "General";

  // Surface the best and worst moves to give the LLM concrete evidence
  const sortedMoves = [...moves].sort(
    (a, b) => b.responseRichnessScore - a.responseRichnessScore,
  );
  const topMoves = sortedMoves.slice(0, 3);
  const bottomMoves = sortedMoves.slice(-2);

  const moveEvidence =
    topMoves.length > 0
      ? `\nHIGHEST-RICHNESS MOVES:\n${topMoves
          .map(
            (m) =>
              `  Turn ${m.turnIndex}: AI="${m.aiQuestion.slice(0, 120)}" → Richness=${m.responseRichnessScore.toFixed(2)} Words=${m.responseWordCount}`,
          )
          .join("\n")}`
      : "";

  const failEvidence =
    bottomMoves.length > 0
      ? `\nLOWEST-RICHNESS / PROBLEM MOVES:\n${bottomMoves
          .map(
            (m) =>
              `  Turn ${m.turnIndex} ${m.ledToAbandonment ? "(ABANDONMENT)" : ""}: AI="${m.aiQuestion.slice(0, 120)}" → Richness=${m.responseRichnessScore.toFixed(2)} Words=${m.responseWordCount}`,
          )
          .join("\n")}`
      : "";

  const extractionPrompt = `You are analyzing a completed survey conversation to extract reusable techniques.

CONVERSATION CONTEXT:
- Domain: ${domainName}
- Survey Goal: ${config.coreObjective || config.expertState?.objective?.goal || "N/A"}
- Completion Rate: ${(signals.completionRate * 100).toFixed(0)}%
- Objective Coverage: ${(signals.objectiveCoverageScore * 100).toFixed(0)}%
- Participant Style: ${signals.detectedStyle ?? "unknown"}
- Avg Words Per Response: ${signals.avgWordsPerResponse.toFixed(1)}
${moveEvidence}${failEvidence}

CONVERSATION (excerpt):
${conversationText.slice(0, 3500)}

TASK:
Extract 2-4 SUCCESSFUL patterns and 1-2 FAILED patterns (anti-patterns). 
Focus ONLY on the AI's question/probing techniques — not on participant behavior.
Use the move evidence above to ground your extractions in specific moments.

Return ONLY valid JSON:
{
  "successfulPatterns": [
    {
      "type": "technique",
      "category": "questioning|probing|transition|engagement|creation|general",
      "title": "Short descriptive title (max 8 words)",
      "description": "What this technique is and why it works mechanically",
      "example": "Exact AI quote from conversation (< 150 chars)",
      "context": "Turn number and situation when this was used (e.g., 'Turn 3, after vague answer')",
      "successIndicators": ["Specific evidence of success, e.g., 'Participant gave 45-word response'"],
      "effectivePhase": "opening|exploration|deepdive|closing",
      "effectiveStyle": "verbose|concise|hesitant|neutral|any"
    }
  ],
  "failedPatterns": [
    {
      "type": "anti-pattern",
      "category": "questioning|probing|transition|engagement|general",
      "title": "What the AI did wrong",
      "description": "Why this approach failed mechanically",
      "example": "Exact AI quote",
      "context": "When this happened",
      "successIndicators": ["Evidence of failure, e.g., 'Led to 1-word response', 'Caused topic avoidance'"],
      "effectivePhase": "opening|exploration|deepdive|closing",
      "effectiveStyle": "any"
    }
  ]
}`;

  try {
    const response = await generateAIResponse(extractionPrompt, undefined, {
      model: analysisModel,
      temperature: 0.2,
      maxTokens: 2000,
      userId: metadata.userId,
      surveyId: metadata.surveyId,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[PatternExtraction] No JSON found in response");
      return emptyResult();
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      successfulPatterns?: Array<
        Omit<ExtractedPattern, "domainId" | "qualityScore" | "metadata">
      >;
      failedPatterns?: Array<
        Omit<ExtractedPattern, "domainId" | "qualityScore" | "metadata">
      >;
    };

    const successfulPatterns: ExtractedPattern[] = (
      parsed.successfulPatterns || []
    ).map((p) => ({
      ...p,
      domainId: config.domainId ?? null,
      qualityScore: computeSignalBackedScore(signals),
      metadata: {
        conversationId: metadata.conversationId,
        surveyId: metadata.surveyId,
        conversationType: metadata.conversationType,
        completionRate: signals.completionRate,
        objectiveCoverageScore: signals.objectiveCoverageScore,
        avgResponseRichnessScore: signals.avgResponseRichnessScore,
        detectedStyle: signals.detectedStyle,
      },
    }));

    const failedPatterns: ExtractedPattern[] = (
      parsed.failedPatterns || []
    ).map((p) => ({
      ...p,
      type: "anti-pattern" as const,
      domainId: config.domainId ?? null,
      qualityScore: 0,
      metadata: {
        conversationId: metadata.conversationId,
        surveyId: metadata.surveyId,
        conversationType: metadata.conversationType,
        completionRate: signals.completionRate,
        objectiveCoverageScore: signals.objectiveCoverageScore,
        avgResponseRichnessScore: signals.avgResponseRichnessScore,
        detectedStyle: signals.detectedStyle,
      },
    }));

    return {
      successfulPatterns,
      failedPatterns,
      domainSpecificLearnings: successfulPatterns.filter(
        (p) => p.domainId !== null,
      ),
      generalLearnings: successfulPatterns.filter((p) => p.domainId === null),
    };
  } catch (error) {
    console.error("[PatternExtraction] Failed to extract patterns:", error);
    return emptyResult();
  }
}

// ---------------------------------------------------------------------------
// Creation conversation extractor
// ---------------------------------------------------------------------------
export async function extractCreationPatterns(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  extractedData: Record<string, unknown>,
  metadata: {
    conversationId: string;
    surveyId: string;
    userId?: string;
    domainId?: number;
  },
): Promise<PatternExtractionResult> {
  const conversationText = conversation
    .map(
      (msg, i) =>
        `[${i + 1}] ${msg.role === "user" ? "CREATOR" : "AI"}: ${msg.content}`,
    )
    .join("\n\n");

  const fieldsCollected = Object.keys(extractedData).filter(
    (key) => extractedData[key] !== null && extractedData[key] !== undefined,
  );
  const completenessRatio = fieldsCollected.length / 12;

  const extractionPrompt = `Analyze this survey CREATION conversation and extract learnings about how the AI guided the creator.

CONVERSATION:
${conversationText.slice(0, 3500)}

DATA COLLECTED: ${fieldsCollected.join(", ")} (${fieldsCollected.length}/12 fields)

Extract patterns related to:
1. Information Gathering — how the AI collected survey requirements
2. Clarification Techniques — what helped clarify vague requirements
3. Flow Management — what made the creation process smooth
4. Resistance Handling — how the AI handled creator pushback

Return ONLY valid JSON:
{
  "successfulPatterns": [
    {
      "type": "technique",
      "category": "creation",
      "title": "Pattern title (max 8 words)",
      "description": "What worked and why mechanically",
      "example": "Exact AI quote",
      "context": "When this was effective",
      "successIndicators": ["Why it worked"],
      "effectivePhase": "opening|exploration|deepdive|closing",
      "effectiveStyle": "any"
    }
  ],
  "failedPatterns": []
}`;

  try {
    const response = await generateAIResponse(extractionPrompt, undefined, {
      model: analysisModel,
      temperature: 0.2,
      maxTokens: 1500,
      userId: metadata.userId,
      surveyId: metadata.surveyId,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return emptyResult();

    const parsed = JSON.parse(jsonMatch[0]) as {
      successfulPatterns?: Array<
        Omit<ExtractedPattern, "domainId" | "qualityScore" | "metadata">
      >;
    };

    const successfulPatterns: ExtractedPattern[] = (
      parsed.successfulPatterns || []
    ).map((p) => ({
      ...p,
      domainId: metadata.domainId ?? null,
      qualityScore: Math.round(completenessRatio * 100),
      metadata: {
        conversationId: metadata.conversationId,
        surveyId: metadata.surveyId,
        conversationType: "creation" as const,
        completionRate: completenessRatio,
        objectiveCoverageScore: completenessRatio,
        avgResponseRichnessScore: 0.5,
      },
    }));

    return {
      successfulPatterns,
      failedPatterns: [],
      domainSpecificLearnings: successfulPatterns.filter(
        (p) => p.domainId !== null,
      ),
      generalLearnings: successfulPatterns.filter((p) => p.domainId === null),
    };
  } catch (error) {
    console.error(
      "[PatternExtraction] Failed to extract creation patterns:",
      error,
    );
    return emptyResult();
  }
}

// ---------------------------------------------------------------------------
// Signal-backed quality score
// ---------------------------------------------------------------------------
/**
 * Computes a 0-100 quality score based entirely on objective signals.
 * Formula: objectiveCoverage(40%) + completionRate(30%) + richness(20%) + dropoff(10%)
 */
export function computeSignalBackedScore(signals: ConversationSignals): number {
  const coverageScore = signals.objectiveCoverageScore * 40;
  const completionScore = signals.completionRate * 30;
  const richnessScore = signals.avgResponseRichnessScore * 20;
  // Dropoff bonus: full 10 if no dropoff, scaled down by where they dropped
  const dropoffScore =
    signals.dropoffTurnIndex === null
      ? 10
      : Math.max(0, 10 - 10 * (1 - signals.completionRate));

  return Math.round(
    Math.min(
      100,
      Math.max(
        0,
        coverageScore + completionScore + richnessScore + dropoffScore,
      ),
    ),
  );
}

function emptyResult(): PatternExtractionResult {
  return {
    successfulPatterns: [],
    failedPatterns: [],
    domainSpecificLearnings: [],
    generalLearnings: [],
  };
}
