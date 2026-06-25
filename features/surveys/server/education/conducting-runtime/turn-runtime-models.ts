import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
} from "../types";

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type TurnAnalysisResult = {
  nodeCoverage?: Record<string, number>;
  completedNodeIds?: string[];
  evidence?: Array<{
    nodeId: string;
    evidenceType: string;
    excerpt: string;
    sentiment?: "positive" | "negative" | "neutral" | "mixed";
    reliability?: number;
  }>;
  contradictions?: string[];
  fatigueScore?: number;
  reliabilityScore?: number;
  notes?: string[];
  shouldStop?: boolean;
};

export type DeriveNextSessionStateInput = {
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
  analysis: TurnAnalysisResult | null;
};

export type ConductingTurnPlan = {
  action: "probe_same_node" | "advance_to_node" | "close";
  targetNodeId: string | null;
  probeType:
    | "example"
    | "mechanism"
    | "barrier"
    | "confidence"
    | "comparison"
    | "clarify"
    | "confirm"
    | null;
  reason: string;
  missingEvidence: string[];
  avoidRepeating: string[];
  assistantMessage: string;
  completionReadiness: number;
  fatigueLevel: "low" | "medium" | "high";
};

export type ResolveTurnPlanInput = {
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
  plan: ConductingTurnPlan | null;
};

export type ConductingTurnInput = {
  surveyId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
};
