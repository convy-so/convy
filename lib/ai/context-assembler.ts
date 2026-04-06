export type AiContextLayerKind =
  | "product_policy"
  | "workflow_state"
  | "expert_guidance"
  | "rag_grounding"
  | "memory"
  | "user_overlay";

export type AiContextLayer = {
  kind: AiContextLayerKind;
  label: string;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
  versionId?: string | null;
  tokenEstimate?: number | null;
  payload?: Record<string, unknown>;
};

const LAYER_PRIORITY: Record<AiContextLayerKind, number> = {
  product_policy: 10,
  workflow_state: 20,
  expert_guidance: 30,
  rag_grounding: 40,
  memory: 50,
  user_overlay: 60,
};

function normalizeContent(value: string) {
  return value.trim();
}

export function assembleAiContext(layers: AiContextLayer[]) {
  return layers
    .map((layer) => ({
      ...layer,
      content: normalizeContent(layer.content),
      priority: LAYER_PRIORITY[layer.kind],
    }))
    .filter((layer) => layer.content.length > 0)
    .sort((left, right) => left.priority - right.priority);
}

export function formatAiContextForSystemPrompt(layers: AiContextLayer[]) {
  return assembleAiContext(layers)
    .map(
      (layer) =>
        `<${layer.kind} label="${layer.label}">\n${layer.content}\n</${layer.kind}>`,
    )
    .join("\n\n");
}

export function estimateContextTokenCount(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}
