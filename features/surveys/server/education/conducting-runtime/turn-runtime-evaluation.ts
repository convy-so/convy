import { nanoid } from "nanoid";

import { analysisModel, generateAIResponse } from "@/shared/ai";
import { safeJsonParse } from "@/shared/ai/json-object-parser";
import { buildConductingTurnEvaluationPrompt } from "../prompts/conducting-runtime";
import type { SessionState } from "../types";
import type { EvidenceRecord } from "../types";
import type {
  ConductingTurnInput,
  TurnAnalysisResult,
} from "./turn-runtime-models";
import {
  resolveActiveCoverageNode,
} from "./turn-runtime-plan-helpers";
import { normalizeTurnAnalysisResult } from "./turn-runtime-normalizers";

export async function evaluateTurn(input: ConductingTurnInput) {
  const activeNode = resolveActiveCoverageNode(
    input.sessionState,
    input.coveragePlan,
  );
  const prompt = buildConductingTurnEvaluationPrompt({
    brief: input.brief,
    coveragePlan: input.coveragePlan,
    messages: input.messages,
    activeNode,
  });

  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 1200,
    attribution: {
      surveyId: input.surveyId,
      feature: "survey-conducting-turn-evaluation",
    },
  });

  return normalizeTurnAnalysisResult(safeJsonParse(raw));
}

export function buildEvidenceRecords(input: {
  surveyId: string;
  sessionId: string;
  analysis: TurnAnalysisResult | null;
  nextState: SessionState;
}) {
  return (input.analysis?.evidence ?? [])
    .filter((item) => item.nodeId && item.excerpt)
    .map((item, index) => ({
      id: nanoid(),
      surveyId: input.surveyId,
      sessionId: input.sessionId,
      nodeId: item.nodeId,
      evidenceType: item.evidenceType,
      excerpt: item.excerpt,
      sentiment: item.sentiment,
      reliability: Math.max(
        0,
        Math.min(
          100,
          item.reliability ?? Math.round(input.nextState.reliabilityScore * 100),
        ),
      ),
      metadata: { source: "turn_analysis", index },
    })) satisfies EvidenceRecord[];
}
