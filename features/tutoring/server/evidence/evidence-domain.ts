import { z } from "zod";

import { LANG_TO_PG_CONFIG, type PgLanguage } from "@/shared/retrieval/core";

export type EvidenceContextItem = {
  id: string;
  content: string;
  score: number;
  sourceType: "material" | "report" | "interaction" | "pattern";
  sourceId: string;
  metadata: Record<string, unknown>;
};

export type ReplaceLessonEvidenceEmbeddingsParams = {
  sourceType: "material" | "report" | "interaction" | "pattern";
  sourceId: string;
  content: string;
  classroomStudentId?: string | null;
  studentUserId?: string | null;
  lessonId?: string | null;
  classroomId?: string | null;
  language?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  sourceTitle?: string | null;
  interactionType?: string | null;
  phaseType?: string | null;
  conceptKey?: string | null;
  scopeType?: string | null;
  sourceUpdatedAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export const teacherEvidenceAnswerSchema = z.object({
  answer: z.string(),
  evidenceHighlights: z.array(z.string()).default([]),
});

export function getPgLanguage(lang?: string | null): PgLanguage {
  return LANG_TO_PG_CONFIG[lang ?? "en"] ?? "english";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getScalarText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function getStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }

  return value[key].filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export function buildReportEvidenceText(report: {
  lesson?: { title?: string | null } | null;
  masteryPercent: number;
  report: Record<string, unknown>;
}) {
  const payload = report.report;
  const conceptProgress = Array.isArray(payload.conceptProgress) ? payload.conceptProgress : [];
  const identifiedGaps = Array.isArray(payload.identifiedGaps) ? payload.identifiedGaps : [];
  const riskFlags = Array.isArray(payload.riskFlags) ? payload.riskFlags : [];
  const recommendedTeacherActions = Array.isArray(payload.recommendedTeacherActions)
    ? payload.recommendedTeacherActions
    : [];

  return [
    `Lesson: ${report.lesson?.title ?? "Unknown lesson"}`,
    `Mastery percent: ${report.masteryPercent}`,
    `Student summary: ${getScalarText(payload.studentSummary)}`,
    `Pedagogical summary: ${getScalarText(payload.pedagogicalSummary)}`,
    conceptProgress.length ? `Concept progress: ${JSON.stringify(conceptProgress)}` : null,
    identifiedGaps.length ? `Identified gaps: ${identifiedGaps.join("; ")}` : null,
    riskFlags.length ? `Risk flags: ${riskFlags.join("; ")}` : null,
    recommendedTeacherActions.length
      ? `Recommended teacher actions: ${recommendedTeacherActions.join("; ")}`
      : null,
    `Transfer readiness: ${getScalarText(payload.transferReadiness, "unknown")}`,
    `Confidence score: ${getScalarText(payload.studentConfidenceScore, "unknown")}`,
    `Metacognitive mirror: ${getScalarText(payload.metacognitiveMirror)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMaterialEvidenceText(params: {
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
}) {
  const segments = Array.isArray(params.sourceDocument.segments)
    ? params.sourceDocument.segments
    : [];
  const segmentGroundings = Array.isArray(params.groundingMap.segmentGroundings)
    ? params.groundingMap.segmentGroundings
    : [];
  const groundingBySegmentId = new Map(
    segmentGroundings
      .filter(
        (segment): segment is Record<string, unknown> =>
          Boolean(segment && typeof segment === "object"),
      )
      .map((segment) => [getScalarText(segment.segmentId), segment]),
  );

  return segments
    .filter(
      (segment): segment is Record<string, unknown> =>
        Boolean(segment && typeof segment === "object"),
    )
    .map((segment, index) => {
      const segmentId = getScalarText(segment.segmentId);
      const headingPath = Array.isArray(segment.headingPath)
        ? segment.headingPath.filter((value): value is string => typeof value === "string")
        : [];
      const grounding = groundingBySegmentId.get(segmentId);

      const concepts =
        isRecord(grounding) && Array.isArray(grounding.concepts)
          ? grounding.concepts
              .flatMap((item) =>
                isRecord(item) && typeof item.name === "string"
                  ? [item.name]
                  : [],
              )
          : [];

      const formulas =
        isRecord(grounding) && Array.isArray(grounding.formulas)
          ? grounding.formulas
              .flatMap((item) =>
                isRecord(item) &&
                typeof item.label === "string" &&
                typeof item.expression === "string"
                  ? [`${item.label}: ${item.expression}`]
                  : [],
              )
          : [];

      return [
        `Segment ${index + 1}`,
        headingPath.length ? `Heading path: ${headingPath.join(" > ")}` : null,
        typeof segment.pageStart === "number"
          ? `Pages: ${segment.pageStart}${typeof segment.pageEnd === "number" ? `-${segment.pageEnd}` : ""}`
          : null,
        concepts.length ? `Concepts: ${concepts.join("; ")}` : null,
        formulas.length ? `Formulas: ${formulas.join("; ")}` : null,
        getStringArray(grounding, "notationRules").length
          ? `Notation rules: ${getStringArray(grounding, "notationRules").join("; ")}`
          : null,
        getStringArray(grounding, "scopeInclusions").length
          ? `Scope: ${getStringArray(grounding, "scopeInclusions").join("; ")}`
          : null,
        typeof segment.text === "string" ? `Text: ${segment.text}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

