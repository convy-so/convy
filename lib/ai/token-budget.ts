/**
 * Token budget management for LLM context windows
 * Prevents context overflow and manages token allocation
 */

// Model-specific context limits (conservative estimates)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4.1-mini": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gemini-2.5-flash": 1000000,
  "gemini-2.5-flash-lite": 1000000,
  "gemini-1.5-pro": 2000000,
};

const DEFAULT_CONTEXT_LIMIT = 100000;

// Reserve tokens for model response
const RESPONSE_TOKEN_RESERVE = 4000;

/**
 * Estimate token count for text using a conservative heuristic.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get maximum context tokens for a model
 */
export function getModelContextLimit(modelId: string): number {
  return MODEL_CONTEXT_LIMITS[modelId] ?? DEFAULT_CONTEXT_LIMIT;
}

/**
 * Get available tokens for prompt after reserving space for response
 */
export function getAvailablePromptTokens(modelId: string): number {
  return getModelContextLimit(modelId) - RESPONSE_TOKEN_RESERVE;
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  options?: {
    ellipsis?: string;
    preserveStart?: boolean;
  },
): string {
  const ellipsis = options?.ellipsis ?? "\n\n[... content truncated ...]\n\n";
  const preserveStart = options?.preserveStart ?? true;

  const currentTokens = estimateTokenCount(text);
  if (currentTokens <= maxTokens) {
    return text;
  }

  const ellipsisTokens = estimateTokenCount(ellipsis);
  const targetTokens = maxTokens - ellipsisTokens;
  const targetChars = targetTokens * 4;

  if (preserveStart) {
    return text.slice(0, targetChars) + ellipsis;
  }

  return ellipsis + text.slice(-targetChars);
}

/**
 * Manage token budget across multiple prompt components
 */
export class TokenBudgetManager {
  private allocations: Map<string, number> = new Map();
  private used: Map<string, number> = new Map();

  constructor(
    private readonly totalBudget: number,
    private readonly modelId: string,
  ) {}

  allocate(component: string, tokens: number): void {
    const currentTotal = Array.from(this.allocations.values()).reduce(
      (sum, val) => sum + val,
      0,
    );

    if (currentTotal + tokens > this.totalBudget) {
      throw new Error(
        `Token budget exceeded: ${currentTotal + tokens} > ${this.totalBudget}`,
      );
    }

    this.allocations.set(component, tokens);
  }

  use(component: string, tokens: number): void {
    const allocated = this.allocations.get(component);
    if (allocated === undefined) {
      throw new Error(`No allocation found for component: ${component}`);
    }

    this.used.set(component, tokens);
  }

  getRemaining(component?: string): number {
    if (component) {
      const allocated = this.allocations.get(component) ?? 0;
      const used = this.used.get(component) ?? 0;
      return Math.max(0, allocated - used);
    }

    const totalAllocated = Array.from(this.allocations.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    const totalUsed = Array.from(this.used.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    return Math.max(0, this.totalBudget - Math.max(totalAllocated, totalUsed));
  }

  getModelId(): string {
    return this.modelId;
  }
}

export function createTokenBudgetManager(totalBudgetOrModelId: number | string, modelId?: string) {
  if (typeof totalBudgetOrModelId === "string") {
    return new TokenBudgetManager(
      getAvailablePromptTokens(totalBudgetOrModelId),
      totalBudgetOrModelId,
    );
  }

  return new TokenBudgetManager(
    totalBudgetOrModelId,
    modelId ?? "unknown-model",
  );
}
