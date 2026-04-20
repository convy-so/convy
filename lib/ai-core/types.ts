export type AiContextLayerKind =
  | "product_policy"
  | "workflow_state"
  | "expert_guidance"
  | "rag_grounding"
  | "memory"
  | "user_overlay";

export type ContextTrustClass =
  | "system"
  | "workflow"
  | "grounded"
  | "memory"
  | "user";

export type PromptOutputMode = "text" | "json" | "xml";

export interface ContextLayer {
  kind: AiContextLayerKind;
  label: string;
  content: string;
  trustClass?: ContextTrustClass;
  sourceType?: string | null;
  sourceId?: string | null;
  versionId?: string | null;
  tokenEstimate?: number | null;
  tokenBudget?: number | null;
  payload?: Record<string, unknown>;
}

export interface ContextBundle {
  key: string;
  versionId: string;
  layers: ContextLayer[];
  rendered: string;
  totalTokenEstimate: number;
  metadata?: Record<string, unknown>;
}

export interface PromptExample {
  user: string;
  assistant: string;
}

export interface PromptSpec {
  id: string;
  versionId: string;
  label: string;
  description?: string;
  systemPrompt: string;
  constraints?: string[];
  examples?: PromptExample[];
  outputMode?: PromptOutputMode;
  metadata?: Record<string, unknown>;
}

export interface RetrievalDocument {
  id: string;
  content: string;
  score: number;
  sourceType?: string;
  sourceId?: string;
  retrievalContent?: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalQuery {
  query: string;
  language?: string | null;
  limit?: number;
  budgetTokens?: number | null;
  metadata?: Record<string, unknown>;
}

export interface RetrievalAdapter {
  key: string;
  description: string;
  retrieve(input: RetrievalQuery): Promise<RetrievalDocument[]>;
}

export interface MemoryRecord {
  id?: string | null;
  content: string;
  category?: string | null;
  strength?: "primary" | "secondary" | "weak";
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  query: string;
  limit?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryAdapter {
  key: string;
  description: string;
  retrieve(input: MemoryQuery): Promise<MemoryRecord[]>;
}

export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
  key: string;
  description: string;
  run(input: TInput): Promise<TOutput>;
}

export interface AgentTask<TInput = unknown, TOutput = unknown> {
  key: string;
  description: string;
  run(input: TInput): Promise<TOutput>;
}
