import { Worker, type Job } from "bullmq";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { aiRuns, evalCases, evalDatasets, evalRuns } from "@/db/schema";
import { getEvalBlueprint } from "@/lib/ai/eval-catalog";
import {
  finishEvalRun,
  judgeEvalCase,
  recordEvalResult,
} from "@/lib/ai/evals";
import type { CoreAiFeature } from "@/lib/ai/observability";
import type { EvalRunJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const evalRunJobSchema = z.object({
  evalRunId: z.string().min(1),
  datasetId: z.string().min(1),
  feature: z.string().min(1),
  triggeredByUserId: z.string().nullable().optional(),
});

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function extractCaseInput(rawInput: Record<string, unknown>) {
  const {
    actualOutput,
    output,
    aiRunId,
    outputText,
    candidateOutput,
    ...rest
  } = rawInput;

  return rest;
}

async function resolveActualOutput(
  rawInput: Record<string, unknown>,
  feature: CoreAiFeature,
) {
  if (typeof rawInput.aiRunId === "string") {
    const aiRun = await getDb().query.aiRuns.findFirst({
      where: eq(aiRuns.id, rawInput.aiRunId),
    });

    if (aiRun) {
      return {
        actualOutput: {
          outputText: aiRun.outputText ?? "",
          metadata: toRecord(aiRun.metadata),
          modelName: aiRun.modelName,
          scenarioType: aiRun.scenarioType,
          feature: aiRun.feature,
        },
        aiRunId: aiRun.id,
      };
    }
  }

  if (typeof rawInput.outputText === "string") {
    return {
      actualOutput: {
        outputText: rawInput.outputText,
        feature,
      },
      aiRunId: null,
    };
  }

  for (const key of ["actualOutput", "candidateOutput", "output"] as const) {
    const value = rawInput[key];
    if (typeof value === "object" && value !== null) {
      return {
        actualOutput: value as Record<string, unknown>,
        aiRunId: null,
      };
    }
  }

  return {
    actualOutput: null,
    aiRunId: null,
  };
}

function summarizeFailureModeCounts(
  results: Array<{ failureModeCodes: string[] }>,
) {
  const counts = new Map<string, number>();

  for (const result of results) {
    for (const code of result.failureModeCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    [...counts.entries()].sort((left, right) => right[1] - left[1]),
  );
}

const evalRunWorker = new Worker<EvalRunJobData>(
  "eval-run",
  async (job: Job<EvalRunJobData>) => {
    const data = evalRunJobSchema.parse(job.data);
    const feature = data.feature as CoreAiFeature;
    const blueprint = getEvalBlueprint(feature);

    await getDb()
      .update(evalRuns)
      .set({
        status: "running",
        startedAtIso: new Date().toISOString(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(evalRuns.id, data.evalRunId));

    try {
      const dataset = await getDb().query.evalDatasets.findFirst({
        where: eq(evalDatasets.id, data.datasetId),
      });

      if (!dataset) {
        throw new Error("Eval dataset not found.");
      }

      const cases = await getDb().query.evalCases.findMany({
        where: and(
          eq(evalCases.datasetId, data.datasetId),
          eq(evalCases.status, "active"),
        ),
        orderBy: [asc(evalCases.caseKey)],
      });

      if (cases.length === 0) {
        throw new Error("Eval dataset has no active cases.");
      }

      const resultRows: Array<{
        score: number;
        pass: boolean;
        failureModeCodes: string[];
        rubricScores: Record<string, number>;
        blockerMissed: boolean;
        missingActualOutput: boolean;
      }> = [];

      for (let index = 0; index < cases.length; index += 1) {
        const evalCase = cases[index];
        const rawInput = toRecord(evalCase.input);
        const caseInput = extractCaseInput(rawInput);
        const { actualOutput, aiRunId } = await resolveActualOutput(rawInput, feature);

        const result =
          actualOutput == null
            ? {
                score: 0,
                pass: false,
                notes:
                  "No actual output was available for this eval case, so the case could not be judged against the educational rubric.",
                rubricScores: {},
                failureModeCodes: ["missing_actual_output"],
              }
            : await judgeEvalCase({
                feature,
                input: caseInput,
                expectedOutput: toRecord(evalCase.expectedOutput),
                rubric: toRecord(evalCase.rubric),
                actualOutput,
              });

        const blockerMissed = Boolean(
          blueprint?.dimensions.some((dimension) => {
            const score = result.rubricScores?.[dimension.key];
            return typeof score === "number" && score < dimension.passFloor;
          }),
        );

        await recordEvalResult({
          evalRunId: data.evalRunId,
          feature,
          evalCaseId: evalCase.id,
          aiRunId,
          result,
          labeledByUserId: data.triggeredByUserId ?? null,
          ontologyVersion: dataset.failureOntologyVersion ?? null,
        });

        resultRows.push({
          score: result.score,
          pass: result.pass,
          failureModeCodes: result.failureModeCodes,
          rubricScores: result.rubricScores,
          blockerMissed,
          missingActualOutput: actualOutput == null,
        });

        await job.updateProgress(
          Math.round(((index + 1) / cases.length) * 100),
        );
      }

      const passCount = resultRows.filter((row) => row.pass).length;
      const failCount = resultRows.length - passCount;
      const averageScore =
        resultRows.reduce((sum, row) => sum + row.score, 0) / resultRows.length;
      const passRate = passCount / resultRows.length;
      const blockerFailureCount = resultRows.filter(
        (row) => row.blockerMissed,
      ).length;
      const missingActualOutputCount = resultRows.filter(
        (row) => row.missingActualOutput,
      ).length;
      const qualityGatePassed = Boolean(
        (blueprint ? passRate >= blueprint.targetPassRate : passRate >= 0.8) &&
          blockerFailureCount === 0 &&
          missingActualOutputCount === 0,
      );

      await finishEvalRun({
        evalRunId: data.evalRunId,
        status: "completed",
        summary: {
          datasetId: data.datasetId,
          feature,
          caseCount: resultRows.length,
          passCount,
          failCount,
          averageScore: Number(averageScore.toFixed(4)),
          passRate: Number(passRate.toFixed(4)),
          blockerFailureCount,
          missingActualOutputCount,
          qualityGatePassed,
          targetPassRate: blueprint?.targetPassRate ?? null,
          releaseBlockerFloor: blueprint?.releaseBlockerFloor ?? null,
          failureModeCounts: summarizeFailureModeCounts(resultRows),
        },
      });

      return {
        success: true,
        evalRunId: data.evalRunId,
        caseCount: resultRows.length,
        passRate,
      };
    } catch (error) {
      await finishEvalRun({
        evalRunId: data.evalRunId,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Eval run failed.",
      });
      throw error;
    }
  },
  {
    connection: getRedisClient(),
    concurrency: 2,
  },
);

export default evalRunWorker;
