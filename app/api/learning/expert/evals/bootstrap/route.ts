import { NextResponse } from "next/server";

import { addEvalCase, createEvalDataset } from "@/app/actions/ai-ops";
import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { learningEvalPresets } from "@/lib/learning/eval-presets";

export async function POST() {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);

    const existing = await getDb().query.evalDatasets.findMany({
      where: (table, { eq }) => eq(table.feature, "tutoring_chat"),
    });
    const results: Array<{
      presetKey: string;
      datasetId: string;
      datasetName: string;
      status: "created" | "existing";
      caseCount: number;
    }> = [];

    for (const preset of learningEvalPresets) {
      const existingDataset = existing.find((dataset) => dataset.name === preset.datasetName);
      if (existingDataset) {
        results.push({
          presetKey: preset.key,
          datasetId: existingDataset.id,
          datasetName: existingDataset.name,
          status: "existing",
          caseCount: 0,
        });
        continue;
      }

      const dataset = await createEvalDataset({
        feature: "tutoring_chat",
        name: preset.datasetName,
        description: preset.description,
        datasetKind: "offline",
        metadata: {
          presetKey: preset.key,
          ...preset.metadata,
        },
      });

      for (const evalCase of preset.cases) {
        await addEvalCase({
          datasetId: dataset.id,
          caseKey: evalCase.caseKey,
          input: evalCase.input,
          expectedOutput: evalCase.expectedOutput,
          tags: evalCase.tags,
        });
      }

      results.push({
        presetKey: preset.key,
        datasetId: dataset.id,
        datasetName: dataset.name,
        status: "created",
        caseCount: preset.cases.length,
      });
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to bootstrap eval datasets",
      },
      { status: 400 },
    );
  }
}
