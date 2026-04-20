import type { PromptSpec, ContextBundle, PromptExample } from "@/lib/ai-core/types";
import {
  deriveContextVersionMetadata,
  derivePromptVersionId,
} from "@/lib/ai-core/context";

function renderPromptSpecExamples(promptSpec?: PromptSpec, dynamicExamples?: PromptExample[]) {
  const examples = [...(promptSpec?.examples ?? []), ...(dynamicExamples ?? [])];
  if (!examples.length) return "";

  return [
    "Few-shot examples:",
    ...examples.flatMap((example) => [
      `User: ${example.user}`,
      `Assistant: ${example.assistant}`,
    ]),
  ].join("\n\n");
}

function renderPromptSpecConstraints(promptSpec?: PromptSpec) {
  if (!promptSpec?.constraints?.length) return "";

  return [
    "Hard constraints:",
    ...promptSpec.constraints.map((constraint) => `- ${constraint}`),
  ].join("\n");
}

export function resolvePromptExecution(input: {
  prompt?: string;
  systemPrompt?: string;
  promptSpec?: PromptSpec;
  contextBundle?: ContextBundle | null;
  dynamicExamples?: PromptExample[];
}) {
  const sections = [
    input.promptSpec?.systemPrompt?.trim() ?? "",
    input.systemPrompt?.trim() ?? "",
    input.contextBundle?.rendered
      ? `<context_bundle key="${input.contextBundle.key}" version="${input.contextBundle.versionId}">\n${input.contextBundle.rendered}\n</context_bundle>`
      : "",
    renderPromptSpecConstraints(input.promptSpec),
    renderPromptSpecExamples(input.promptSpec, input.dynamicExamples),
  ].filter((section) => section.length > 0);

  const resolvedSystemPrompt = sections.join("\n\n");
  const promptVersionId = derivePromptVersionId(
    resolvedSystemPrompt,
    input.promptSpec?.versionId ?? null,
  );
  const contextVersionMetadata = deriveContextVersionMetadata(input.contextBundle);

  return {
    prompt: input.prompt ?? "",
    systemPrompt: resolvedSystemPrompt,
    promptVersionId,
    contextLayers: input.contextBundle?.layers ?? [],
    contextBundleVersionId: input.contextBundle?.versionId ?? null,
    ...contextVersionMetadata,
  };
}
