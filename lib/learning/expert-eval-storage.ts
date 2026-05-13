import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { expertEvalCases, expertEvalDatasets } from "@/db/schema";

type SeedEvalCase = {
  caseKey: string;
  prompt: string;
  expectedBehavior: string;
  referenceAnswer?: string;
  evaluationFocus: string;
  metadata?: Record<string, unknown>;
};

type SeedEvalDataset = {
  presetKey: string;
  title: string;
  description: string;
  family: string;
  subjectKey?: string;
  metadata?: Record<string, unknown>;
  cases: SeedEvalCase[];
};

const TUTORING_EVAL_DATASETS: SeedEvalDataset[] = [
  {
    presetKey: "knowledge_accuracy",
    title: "Knowledge Accuracy",
    description:
      "Checks that tutoring stays faithful to uploaded course materials and avoids unsupported claims.",
    family: "knowledge_accuracy",
    metadata: { pipeline: "expert_bootstrap", purpose: "scope_fidelity" },
    cases: [
      {
        caseKey: "ka_1",
        prompt:
          "A student asks for a definition that is not present in the uploaded lesson. The tutor should answer the request.",
        expectedBehavior:
          "The tutor should acknowledge the gap, avoid inventing facts, and ground the response in available material or ask for more context.",
        evaluationFocus: "No unsupported factual claims outside grounded material.",
      },
      {
        caseKey: "ka_2",
        prompt:
          "A student gives a partially correct explanation and asks whether it matches the course notation.",
        expectedBehavior:
          "The tutor should verify against the topic notation and correct only with material-consistent language.",
        evaluationFocus: "Notation fidelity and in-scope correction.",
      },
      {
        caseKey: "ka_3",
        prompt:
          "A student asks the tutor to connect the current topic to an advanced concept that has not been uploaded.",
        expectedBehavior:
          "The tutor should resist drifting into new content and instead explain the boundary or relate only through already approved materials.",
        evaluationFocus: "Boundary discipline under curiosity pressure.",
      },
    ],
  },
  {
    presetKey: "pedagogical_behavior",
    title: "Pedagogical Behavior",
    description:
      "Checks that published heuristics and staged tutoring behavior are applied in the right situations.",
    family: "pedagogical_behavior",
    metadata: { pipeline: "expert_bootstrap", purpose: "heuristic_application" },
    cases: [
      {
        caseKey: "pb_1",
        prompt:
          "A student gives a shallow but technically correct answer after a probing question.",
        expectedBehavior:
          "The tutor should deepen the reasoning instead of praising and moving on immediately.",
        evaluationFocus: "Depth-probing rather than premature closure.",
      },
      {
        caseKey: "pb_2",
        prompt:
          "A student shows confusion after two failed attempts and starts guessing.",
        expectedBehavior:
          "The tutor should increase support, narrow the task, and scaffold the next move rather than escalating difficulty.",
        evaluationFocus: "Adaptive support and productive struggle calibration.",
      },
      {
        caseKey: "pb_3",
        prompt:
          "A student asks for the final answer without showing work.",
        expectedBehavior:
          "The tutor should request reasoning or an attempt before supplying a full worked solution.",
        evaluationFocus: "Reasoning-first tutoring policy.",
      },
    ],
  },
  {
    presetKey: "depth_probing",
    title: "Depth-Probing",
    description:
      "Checks that the tutor challenges surface understanding and looks for transfer or explanation quality.",
    family: "depth_probing",
    metadata: { pipeline: "expert_bootstrap", purpose: "conceptual_depth" },
    cases: [
      {
        caseKey: "dp_1",
        prompt:
          "A student reaches the correct numeric answer but cannot explain why the method works.",
        expectedBehavior:
          "The tutor should ask a follow-up that surfaces the underlying concept rather than treating the answer as sufficient.",
        evaluationFocus: "Conceptual explanation after correctness.",
      },
      {
        caseKey: "dp_2",
        prompt:
          "A student repeats a memorized rule but fails to apply it in a slightly changed scenario.",
        expectedBehavior:
          "The tutor should probe transfer by contrasting the original and changed cases.",
        evaluationFocus: "Transfer beyond rote recall.",
      },
      {
        caseKey: "dp_3",
        prompt:
          "A student solves the example exactly as modeled and claims full understanding.",
        expectedBehavior:
          "The tutor should test flexibility with a near-transfer variant or comparison prompt.",
        evaluationFocus: "Detecting shallow imitation.",
      },
    ],
  },
  {
    presetKey: "regression",
    title: "Regression",
    description:
      "Runs the stable tutoring suite after framework, crystallization, or runtime-model changes.",
    family: "regression",
    metadata: { pipeline: "expert_bootstrap", purpose: "release_guardrail" },
    cases: [
      {
        caseKey: "rg_1",
        prompt:
          "A student mixes two related concepts and asks for a direct answer quickly.",
        expectedBehavior:
          "The tutor should separate the concepts clearly, preserve scope, and still keep the interaction efficient.",
        evaluationFocus: "Balanced clarity under speed pressure.",
      },
      {
        caseKey: "rg_2",
        prompt:
          "A student expresses low confidence after repeated friction in the same topic.",
        expectedBehavior:
          "The tutor should acknowledge affect, maintain challenge appropriately, and avoid empty reassurance.",
        evaluationFocus: "Confidence-sensitive pedagogy.",
      },
      {
        caseKey: "rg_3",
        prompt:
          "A student asks a curiosity question that is adjacent but not directly in the lesson scope.",
        expectedBehavior:
          "The tutor should respond with a bounded bridge that stays aligned to the current learning objective.",
        evaluationFocus: "Scope control with useful curiosity handling.",
      },
    ],
  },
];

export async function countExpertEvalDatasets() {
  const [result] = await getDb()
    .select({ value: count() })
    .from(expertEvalDatasets);

  return result?.value ?? 0;
}

export async function bootstrapExpertEvalDatasets() {
  return await getDb().transaction(async (tx) => {
    const results: Array<{
      presetKey: string;
      datasetId: string;
      datasetName: string;
      status: "created" | "existing";
      caseCount: number;
    }> = [];

    for (const seed of TUTORING_EVAL_DATASETS) {
      let dataset = await tx.query.expertEvalDatasets.findFirst({
        where: eq(expertEvalDatasets.presetKey, seed.presetKey),
      });

      const wasCreated = !dataset;

      if (!dataset) {
        [dataset] = await tx
          .insert(expertEvalDatasets)
          .values({
            id: nanoid(),
            presetKey: seed.presetKey,
            title: seed.title,
            description: seed.description,
            family: seed.family,
            subjectKey: seed.subjectKey ?? null,
            status: "ready",
            caseCount: 0,
            metadata: seed.metadata ?? {},
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      }

      const existingCases = await tx.query.expertEvalCases.findMany({
        where: eq(expertEvalCases.datasetId, dataset.id),
      });
      const existingKeys = new Set(existingCases.map((item) => item.caseKey));
      const missingCases = seed.cases.filter((item) => !existingKeys.has(item.caseKey));

      if (missingCases.length > 0) {
        await tx.insert(expertEvalCases).values(
          missingCases.map((item, index) => ({
            id: nanoid(),
            datasetId: dataset.id,
            caseKey: item.caseKey,
            ordinal: existingCases.length + index + 1,
            prompt: item.prompt,
            expectedBehavior: item.expectedBehavior,
            referenceAnswer: item.referenceAnswer ?? null,
            evaluationFocus: item.evaluationFocus,
            metadata: item.metadata ?? {},
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }

      const nextCaseCount = existingCases.length + missingCases.length;
      await tx
        .update(expertEvalDatasets)
        .set({
          title: seed.title,
          description: seed.description,
          family: seed.family,
          subjectKey: seed.subjectKey ?? null,
          status: "ready",
          caseCount: nextCaseCount,
          metadata: seed.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(expertEvalDatasets.id, dataset.id));

      results.push({
        presetKey: seed.presetKey,
        datasetId: dataset.id,
        datasetName: seed.title,
        status: wasCreated ? "created" : "existing",
        caseCount: nextCaseCount,
      });
    }

    return results;
  });
}
