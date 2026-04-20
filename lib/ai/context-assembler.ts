export type {
  AiContextLayerKind,
  ContextLayer as AiContextLayer,
  ContextBundle as AiContextBundle,
} from "@/lib/ai-core/types";

export {
  assembleAiContext,
  buildContextBundle,
  estimateContextTokenCount,
  formatAiContextForSystemPrompt,
} from "@/lib/ai-core/context";
