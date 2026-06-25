import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { learningEvidenceEmbeddings, topicMaterials } from "@/shared/db/schema";
import { deleteLearningMaterial } from "@/shared/infra/supabase-storage";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function buildMaterialAnalysisPreview(params: {
  groundingMap: Record<string, unknown>;
}) {
  const overview =
    typeof params.groundingMap.overview === "string"
      ? params.groundingMap.overview
      : "";
  const scopeRules = Array.isArray(params.groundingMap.scopeRules)
    ? (params.groundingMap.scopeRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const notationRules = Array.isArray(params.groundingMap.notationRules)
    ? (params.groundingMap.notationRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const rigorRules = Array.isArray(params.groundingMap.rigorRules)
    ? (params.groundingMap.rigorRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const ambiguities = Array.isArray(params.groundingMap.ambiguities)
    ? (params.groundingMap.ambiguities as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    summary: overview || "Material grounded successfully.",
    groundingSummary: overview,
    supportedOutcomes: [],
    partialOutcomes: [],
    unsupportedOutcomes: [],
    clarifyingQuestions: [],
    coverageObservations: [...scopeRules, ...ambiguities].slice(0, 6),
    recommendedOutcomeEdits: [],
    rigorNotes: rigorRules.slice(0, 6),
    notationNotes: notationRules.slice(0, 6),
    scopeNotes: scopeRules.slice(0, 6),
  };
}

export async function deleteMaterialProcessingArtifacts(params: {
  materialId?: string | null;
  storagePath?: string | null;
  deleteSourceFile?: boolean;
}) {
  if (params.materialId) {
    await getDb()
      .delete(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.sourceType, "material"),
          eq(learningEvidenceEmbeddings.sourceId, params.materialId),
        ),
      );
    await getDb().delete(topicMaterials).where(eq(topicMaterials.id, params.materialId));
  }

  if (params.deleteSourceFile && params.storagePath) {
    try {
      await deleteLearningMaterial(params.storagePath);
    } catch (error) {
      console.warn("[learning-material-worker] failed to cleanup storage object", {
        storagePath: params.storagePath,
        error: getErrorMessage(error, "Storage cleanup failed"),
      });
    }
  }
}
