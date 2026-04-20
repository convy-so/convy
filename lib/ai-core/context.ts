import { createHash } from "crypto";

import type { ContextBundle, ContextLayer } from "@/lib/ai-core/types";

const LAYER_PRIORITY: Record<ContextLayer["kind"], number> = {
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

function estimateContextTokenCount(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}

function hashVersion(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export function assembleAiContext(layers: ContextLayer[]) {
  return layers
    .map((layer) => ({
      ...layer,
      content: normalizeContent(layer.content),
      trustClass:
        layer.trustClass ??
        (layer.kind === "product_policy"
          ? "system"
          : layer.kind === "workflow_state"
            ? "workflow"
            : layer.kind === "rag_grounding" || layer.kind === "expert_guidance"
              ? "grounded"
              : layer.kind === "memory"
                ? "memory"
                : "user"),
      tokenEstimate:
        layer.tokenEstimate ?? estimateContextTokenCount(layer.content),
      priority: LAYER_PRIORITY[layer.kind],
    }))
    .filter((layer) => layer.content.length > 0)
    .sort((left, right) => left.priority - right.priority)
    .map(({ priority, ...layer }) => layer);
}

export function formatAiContextForSystemPrompt(layers: ContextLayer[]) {
  return assembleAiContext(layers)
    .map((layer) => {
      const attributes = [
        `label="${layer.label.replace(/"/g, "&quot;")}"`,
        `trust="${layer.trustClass ?? "grounded"}"`,
        layer.sourceType ? `sourceType="${layer.sourceType}"` : null,
        layer.sourceId ? `sourceId="${layer.sourceId}"` : null,
        layer.versionId ? `versionId="${layer.versionId}"` : null,
      ]
        .filter(Boolean)
        .join(" ");

      return `<${layer.kind} ${attributes}>\n${layer.content}\n</${layer.kind}>`;
    })
    .join("\n\n");
}

export function buildContextBundle(input: {
  key: string;
  layers: ContextLayer[];
  metadata?: Record<string, unknown>;
}) {
  const normalizedLayers = assembleAiContext(input.layers);
  const rendered = formatAiContextForSystemPrompt(normalizedLayers);
  const totalTokenEstimate = normalizedLayers.reduce(
    (sum, layer) => sum + (layer.tokenEstimate ?? 0),
    0,
  );

  return {
    key: input.key,
    versionId: hashVersion(
      `${input.key}:${normalizedLayers
        .map((layer) => `${layer.kind}:${layer.versionId ?? layer.content}`)
        .join("|")}`,
    ),
    layers: normalizedLayers,
    rendered,
    totalTokenEstimate,
    metadata: input.metadata,
  } satisfies ContextBundle;
}

export function derivePromptVersionId(systemPrompt: string, versionHint?: string | null) {
  if (versionHint && versionHint.trim().length > 0) {
    return versionHint;
  }
  return `prompt_${hashVersion(systemPrompt)}`;
}

export function deriveContextVersionMetadata(bundle?: ContextBundle | null) {
  if (!bundle) {
    return {
      expertGuidanceVersionId: null,
      userOverlayVersionId: null,
    };
  }

  const expertGuidanceVersionId =
    bundle.layers
      .filter((layer) => layer.kind === "expert_guidance")
      .map((layer) => layer.versionId)
      .filter((value): value is string => Boolean(value))
      .join(",") || null;
  const userOverlayVersionId =
    bundle.layers
      .filter((layer) => layer.kind === "user_overlay")
      .map((layer) => layer.versionId)
      .filter((value): value is string => Boolean(value))
      .join(",") || null;

  return {
    expertGuidanceVersionId,
    userOverlayVersionId,
  };
}

export { estimateContextTokenCount };
