import type { ToolSet } from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  aiContextRecords,
  aiFeedbackEvents,
  aiRuns,
  aiSteps,
  aiToolCalls,
} from "@/db/schema";
import type { AiContextLayer } from "@/lib/ai/context-assembler";

export type CoreAiFeature =
  | "survey_creation"
  | "survey_conducting"
  | "survey_analytics"
  | "survey_refinement"
  | "tutoring_chat"
  | "tutoring_voice"
  | "tutoring_media"
  | "memory_behavior";

export type AiRunTraceInput = {
  feature: CoreAiFeature;
  runKind?: string;
  scenarioType?: string | null;
  status?: string;
  userId?: string | null;
  organizationId?: string | null;
  actorRole?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersionId?: string | null;
  expertGuidanceVersionId?: string | null;
  userOverlayVersionId?: string | null;
  failureOntologyVersion?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  metadata?: Record<string, unknown>;
};

export type AiRunFinishInput = {
  status: "completed" | "failed" | "canceled";
  outputText?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: string | null;
  metadata?: Record<string, unknown>;
};

function previewContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 240) return normalized;
  return `${normalized.slice(0, 237)}...`;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (value === undefined) return {};
  return { value };
}

export async function createAiRunTrace(input: AiRunTraceInput) {
  const id = nanoid();
  await getDb().insert(aiRuns).values({
    id,
    feature: input.feature,
    runKind: input.runKind ?? "generation",
    scenarioType: input.scenarioType ?? null,
    status: input.status ?? "running",
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    actorRole: input.actorRole ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    modelProvider: input.modelProvider ?? null,
    modelName: input.modelName ?? null,
    promptVersionId: input.promptVersionId ?? null,
    expertGuidanceVersionId: input.expertGuidanceVersionId ?? null,
    userOverlayVersionId: input.userOverlayVersionId ?? null,
    failureOntologyVersion: input.failureOntologyVersion ?? null,
    temperatureMilli:
      typeof input.temperature === "number"
        ? Math.round(input.temperature * 1000)
        : null,
    maxTokens: input.maxTokens ?? null,
    metadata: input.metadata ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

export async function recordAiContextLayers(runId: string, layers: AiContextLayer[]) {
  if (layers.length === 0) return;

  await getDb().insert(aiContextRecords).values(
    layers.map((layer, index) => ({
      id: nanoid(),
      aiRunId: runId,
      layerKind: layer.kind,
      layerLabel: layer.label,
      priority: index,
      sourceType: layer.sourceType ?? null,
      sourceId: layer.sourceId ?? null,
      versionId: layer.versionId ?? null,
      tokenEstimate: layer.tokenEstimate ?? null,
      contentPreview: previewContent(layer.content),
      payload: layer.payload ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

export async function finishAiRunTrace(runId: string, input: AiRunFinishInput) {
  const [existing] = await getDb()
    .select({
      metadata: aiRuns.metadata,
    })
    .from(aiRuns)
    .where(eq(aiRuns.id, runId))
    .limit(1);

  await getDb()
    .update(aiRuns)
    .set({
      status: input.status,
      outputText: input.outputText ?? null,
      errorMessage: input.errorMessage ?? null,
      latencyMs: input.latencyMs ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
      metadata: {
        ...((existing?.metadata as Record<string, unknown> | undefined) ?? {}),
        ...(input.metadata ?? {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(aiRuns.id, runId));
}

export async function recordAiStep(input: {
  runId: string;
  stepKey: string;
  stepType: string;
  status?: string;
  payload?: Record<string, unknown>;
  outputSummary?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
}) {
  await getDb().insert(aiSteps).values({
    id: nanoid(),
    aiRunId: input.runId,
    stepKey: input.stepKey,
    stepType: input.stepType,
    status: input.status ?? "completed",
    payload: input.payload ?? {},
    outputSummary: input.outputSummary ?? null,
    errorMessage: input.errorMessage ?? null,
    latencyMs: input.latencyMs ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function recordAiFeedbackEvent(input: {
  runId?: string | null;
  userId?: string | null;
  source: string;
  feedbackType: string;
  rating?: number | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
}) {
  await getDb().insert(aiFeedbackEvents).values({
    id: nanoid(),
    aiRunId: input.runId ?? null,
    userId: input.userId ?? null,
    source: input.source,
    feedbackType: input.feedbackType,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
    payload: input.payload ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function recordAiToolCall(input: {
  runId: string;
  toolName: string;
  status: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  errorMessage?: string | null;
  latencyMs?: number | null;
}) {
  await getDb().insert(aiToolCalls).values({
    id: nanoid(),
    aiRunId: input.runId,
    toolName: input.toolName,
    status: input.status,
    input: toJsonRecord(input.toolInput),
    output: toJsonRecord(input.toolOutput),
    errorMessage: input.errorMessage ?? null,
    latencyMs: input.latencyMs ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export function wrapToolSetWithObservability(
  tools: ToolSet | undefined,
  runIdPromise: Promise<string | null>,
) {
  if (!tools) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDefinition]) => {
      if (
        !toolDefinition ||
        typeof toolDefinition !== "object" ||
        typeof toolDefinition.execute !== "function"
      ) {
        return [toolName, toolDefinition];
      }
      const execute = toolDefinition.execute;

      return [
        toolName,
        {
          ...toolDefinition,
          execute: async (input: unknown, options: unknown) => {
            const startedAt = Date.now();
            const runId = await runIdPromise;

            try {
              const output = await execute(input, options as never);
              if (runId) {
                await recordAiToolCall({
                  runId,
                  toolName,
                  status: "completed",
                  toolInput: input,
                  toolOutput: output,
                  latencyMs: Date.now() - startedAt,
                });
              }
              return output;
            } catch (error) {
              if (runId) {
                await recordAiToolCall({
                  runId,
                  toolName,
                  status: "failed",
                  toolInput: input,
                  errorMessage: error instanceof Error ? error.message : "Tool call failed",
                  latencyMs: Date.now() - startedAt,
                });
              }
              throw error;
            }
          },
        },
      ];
    }),
  ) as ToolSet;
}
