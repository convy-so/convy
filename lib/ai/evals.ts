import { Output, generateText } from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  evalCases,
  evalResults,
  evalRuns,
  failureLabels,
  failureModes,
} from "@/db/schema";
import { analysisModel } from "@/lib/ai";
import { getEvalBlueprint } from "@/lib/ai/eval-catalog";
import type { CoreAiFeature } from "@/lib/ai/observability";

const evalJudgeSchema = z.object({
  score: z.number().min(0).max(1),
  pass: z.boolean(),
  notes: z.string(),
  rubricScores: z.record(z.string(), z.number().min(0).max(1)).default({}),
  failureModeCodes: z.array(z.string()).default([]),
});

export type EvalJudgeResult = z.infer<typeof evalJudgeSchema>;

function normalizeJsonRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export async function createEvalRun(params: {
  datasetId?: string | null;
  feature: CoreAiFeature;
  triggerType: "offline" | "ci" | "production_sample" | "manual";
  triggeredByUserId?: string | null;
  targetVersionId?: string | null;
  summary?: Record<string, unknown>;
}) {
  const id = nanoid();

  await getDb().insert(evalRuns).values({
    id,
    datasetId: params.datasetId ?? null,
    triggerType: params.triggerType,
    feature: params.feature,
    status: "running",
    triggeredByUserId: params.triggeredByUserId ?? null,
    targetVersionId: params.targetVersionId ?? null,
    summary: params.summary ?? {},
    startedAtIso: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return id;
}

export async function finishEvalRun(params: {
  evalRunId: string;
  status: "completed" | "failed" | "canceled";
  summary?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  await getDb()
    .update(evalRuns)
    .set({
      status: params.status,
      summary: params.summary ?? {},
      errorMessage: params.errorMessage ?? null,
      completedAtIso: new Date().toISOString(),
      updatedAt: new Date(),
    })
    .where(eq(evalRuns.id, params.evalRunId));
}

function safelyStringifyContext(obj: unknown, maxStringLength = 1500): string {
  if (obj === undefined) return "";
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "string" && value.length > maxStringLength) {
      return value.substring(0, maxStringLength) + `... [TRUNCATED ${value.length - maxStringLength} chars]`;
    }
    return value;
  }, 2);
}

export async function judgeEvalCase(params: {
  feature: CoreAiFeature;
  input: Record<string, unknown>;
  actualOutput: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  rubric?: Record<string, unknown>;
}) {
  const blueprint = getEvalBlueprint(params.feature);

  // 1. Run Deterministic Checks First
  const deterministicFailureCodes: string[] = [];
  const deterministicNotes: string[] = [];
  if (blueprint?.deterministicChecks) {
    for (const check of blueprint.deterministicChecks) {
      try {
        const result = check(params.input, params.actualOutput);
        if (result && !result.passed) {
          if (result.failureCode) deterministicFailureCodes.push(result.failureCode);
          if (result.notes) deterministicNotes.push(result.notes);
        }
      } catch (e) {
        deterministicFailureCodes.push("deterministic_eval_crash");
        deterministicNotes.push(`Eval crashed during deterministic check: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // If deterministic checks fully fail the output and we don't want LLM opinion, we could return early.
  // However, LLMs can still provide useful nuance/rubric scores, so we will inject deterministic failures into the prompt.

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: evalJudgeSchema,
    }),
    prompt: `You are evaluating the quality of an AI feature in a vertical AI product.
    
Feature: ${params.feature}
Input:
${safelyStringifyContext(params.input)}

Actual output:
${safelyStringifyContext(params.actualOutput)}

Expected output:
${safelyStringifyContext(params.expectedOutput ?? {})}

Rubric:
${safelyStringifyContext(params.rubric ?? {})}

Educational priorities:
${blueprint?.guidance.map((item) => `- ${item}`).join("\n") ?? "- Use the supplied rubric faithfully."}

Essential evaluation dimensions:
${blueprint?.dimensions
  .map(
    (dimension) =>
      `- ${dimension.key}: ${dimension.description} | weight=${dimension.weight} | pass_floor=${dimension.passFloor}`,
  )
  .join("\n") ?? "- Use the dimensions in the rubric."}

${blueprint?.gradingExamples && blueprint.gradingExamples.length > 0 ? `
Few-Shot Grading Examples to calibrate your scores:
${blueprint.gradingExamples.map(ex => `
- Example Input: ${ex.inputSummary}
- Example Output: ${ex.actualOutputSummary}
- Expected Score: ${ex.expectedScore}
- Expected Failure Codes: ${ex.expectedFailureCodes.join(", ") || "None"}
- Rationale: ${ex.rationale}`).join("\n")}
` : ""}

${deterministicFailureCodes.length > 0 ? `
CRITICAL DETERMINISTIC FAILURES:
Our programmatic checks have already determined that this output contains the following failure codes: ${deterministicFailureCodes.join(", ")}.
Notes: ${deterministicNotes.map(n => "- " + n).join("\n")}
You MUST include these failure codes in your final output, and adjust your score downwards accordingly.` : ""}

Instructions:
- Score from 0 to 1 based on how well the actual output satisfies the rubric and expected output.
- pass should be true only when the output is strong enough to ship for this feature.
- Weight educational correctness and usefulness above style.
- If a blocker dimension falls below its pass floor, the case should usually fail even if the prose is polished.
- rubricScores should contain per-dimension scores when the rubric suggests dimensions.
- failureModeCodes should list concise snake_case failure labels only when real issues are present.
- notes should explain the judgment briefly and concretely.`,
  });

  // Ensure deterministic codes are never lost if the LLM ignores instructions
  if (deterministicFailureCodes.length > 0) {
    output.pass = false; // Deterministic failures are strict overrides
    
    for (const code of deterministicFailureCodes) {
      if (!output.failureModeCodes.includes(code)) {
         output.failureModeCodes.push(code);
      }
    }
    if (deterministicNotes.length > 0) {
      output.notes = `[DETERMINISTIC FAILURE] ${deterministicNotes.join("; ")} | [JUDGE] ${output.notes}`;
    }
  }

  return output;
}

export async function recordEvalResult(params: {
  evalRunId: string;
  feature: CoreAiFeature;
  evalCaseId?: string | null;
  aiRunId?: string | null;
  result: EvalJudgeResult;
  actualOutput?: Record<string, unknown> | null;
  labeledByUserId?: string | null;
  ontologyVersion?: string | null;
}) {
  const evalResultId = nanoid();

  await getDb().insert(evalResults).values({
    id: evalResultId,
    evalRunId: params.evalRunId,
    evalCaseId: params.evalCaseId ?? null,
    aiRunId: params.aiRunId ?? null,
    score: params.result.score.toFixed(4),
    pass: params.result.pass,
    judgeModel: "analysis-model",
    output: {
      notes: params.result.notes,
      failureModeCodes: params.result.failureModeCodes,
      actualOutput: params.actualOutput ?? null,
    },
    rubricScores: params.result.rubricScores,
    notes: params.result.notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (params.result.failureModeCodes.length === 0) {
    return evalResultId;
  }

  const matchingFailureModes = await getDb()
    .select({
      id: failureModes.id,
      code: failureModes.code,
    })
    .from(failureModes)
    .where(
      and(
        eq(failureModes.feature, params.feature),
        ...(params.ontologyVersion
          ? [eq(failureModes.ontologyVersion, params.ontologyVersion)]
          : []),
      ),
    );

  const matchedIds = matchingFailureModes
    .filter((mode) => params.result.failureModeCodes.includes(mode.code))
    .map((mode) => mode.id);

  if (matchedIds.length === 0) {
    return evalResultId;
  }

  await getDb().insert(failureLabels).values(
    matchedIds.map((failureModeId) => ({
      id: nanoid(),
      aiRunId: params.aiRunId ?? null,
      evalResultId,
      failureModeId,
      labeledByUserId: params.labeledByUserId ?? null,
      source: "judge",
      confidence: null,
      notes: params.result.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );

  return evalResultId;
}

export async function runStoredEvalCaseJudgement(params: {
  evalRunId: string;
  evalCaseId: string;
  feature: CoreAiFeature;
  actualOutput: Record<string, unknown>;
  aiRunId?: string | null;
  labeledByUserId?: string | null;
  ontologyVersion?: string | null;
}) {
  const evalCase = await getDb().query.evalCases.findFirst({
    where: eq(evalCases.id, params.evalCaseId),
  });

  if (!evalCase) {
    throw new Error("Eval case not found");
  }

  const result = await judgeEvalCase({
    feature: params.feature,
    input: normalizeJsonRecord(evalCase.input),
    expectedOutput: normalizeJsonRecord(evalCase.expectedOutput),
    rubric: normalizeJsonRecord(evalCase.rubric),
    actualOutput: params.actualOutput,
  });

  const evalResultId = await recordEvalResult({
    evalRunId: params.evalRunId,
    feature: params.feature,
    evalCaseId: evalCase.id,
    aiRunId: params.aiRunId ?? null,
    result,
    actualOutput: params.actualOutput,
    labeledByUserId: params.labeledByUserId ?? null,
    ontologyVersion: params.ontologyVersion ?? null,
  });

  return {
    evalCase,
    result,
    evalResultId,
  };
}
