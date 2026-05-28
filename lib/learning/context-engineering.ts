import {
  buildContextBundle,
  estimateContextTokenCount,
  type ContextBundle,
  type ContextLayer,
} from "@/lib/ai-core";
import type { PromptCacheOptions } from "@/lib/prompt-caching";

type BudgetedLayer = ContextLayer & {
  tokenBudget?: number | null;
};

function trimLayerToBudget(layer: BudgetedLayer): ContextLayer | null {
  const budget = layer.tokenBudget ?? null;
  const normalized = layer.content.trim();
  if (!normalized) return null;
  if (!budget || estimateContextTokenCount(normalized) <= budget) {
    return { ...layer, content: normalized };
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const kept: string[] = [];
  let running = 0;
  for (const line of lines) {
    const estimate = estimateContextTokenCount(line);
    if (kept.length > 0 && running + estimate > budget) break;
    kept.push(line);
    running += estimate;
  }

  return kept.length > 0
    ? {
        ...layer,
        content: kept.join("\n"),
        tokenEstimate: running,
      }
    : null;
}

export function buildBudgetedContextBundle(input: {
  key: string;
  layers: BudgetedLayer[];
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}): ContextBundle {
  const trimmedLayers = input.layers
    .map(trimLayerToBudget)
    .filter((layer): layer is ContextLayer => Boolean(layer));

  if (!input.maxTokens) {
    return buildContextBundle({
      key: input.key,
      layers: trimmedLayers,
      metadata: input.metadata,
    });
  }

  const selected: ContextLayer[] = [];
  let running = 0;
  for (const layer of trimmedLayers) {
    const estimate = layer.tokenEstimate ?? estimateContextTokenCount(layer.content);
    if (selected.length > 0 && running + estimate > input.maxTokens) continue;
    selected.push(layer);
    running += estimate;
  }

  return buildContextBundle({
    key: input.key,
    layers: selected,
    metadata: input.metadata,
  });
}

export function buildPromptCacheConfig(input: {
  namespace: string;
  staticSystemPrompt: string;
  ttlSeconds?: number;
}): PromptCacheOptions | undefined {
  const staticPrompt = input.staticSystemPrompt.trim();
  if (!staticPrompt) return undefined;

  return {
    namespace: input.namespace,
    staticSystemPrompt: staticPrompt,
    ttlSeconds: input.ttlSeconds,
  };
}
