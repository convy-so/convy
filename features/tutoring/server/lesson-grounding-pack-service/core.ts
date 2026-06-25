import { nanoid } from "nanoid";
import { z } from "zod";

import {
  TOPIC_GROUNDING_PACK_MAX_INPUT_CHARS,
} from "@/features/tutoring/server/prompts/lesson-grounding-pack";
import {
  type GroundingCitation,
  type MaterialGroundingMap,
  topicGroundingFormulaSchema,
  topicGroundingPackSchema,
  topicGroundingSectionSchema,
  type TopicGroundingPack,
  type TopicSourceBoundary,
} from "@/features/tutoring/public-server";

export const topicGroundingPackExtractSchema = topicGroundingPackSchema
  .omit({
    version: true,
    builtAt: true,
    materialIds: true,
    topicTitle: true,
  })
  .extend({
    formulas: z.array(
      topicGroundingFormulaSchema.omit({ id: true }).extend({
        id: z.string().optional(),
      }),
    ),
    sections: z.array(
      topicGroundingSectionSchema.omit({ id: true }).extend({
        id: z.string().optional(),
      }),
    ),
  });

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueCitations(citations: GroundingCitation[]) {
  const seen = new Set<string>();
  const deduped: GroundingCitation[] = [];

  for (const citation of citations) {
    const key = JSON.stringify([
      citation.materialId,
      citation.segmentId,
      citation.pageStart,
      citation.pageEnd,
      citation.headingPath,
      citation.snippet,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(citation);
  }

  return deduped;
}

export function mergePackWithBoundary(
  pack: TopicGroundingPack,
  boundary: TopicSourceBoundary,
): TopicGroundingPack {
  return topicGroundingPackSchema.parse({
    ...pack,
    notationRules: uniqueStrings([...pack.notationRules, ...boundary.notationNotes]),
    rigorRules: uniqueStrings([...pack.rigorRules, ...boundary.rigorNotes]),
    scopeRules: uniqueStrings([...pack.scopeRules, ...boundary.scopeNotes]),
  });
}

export function buildCompiledGroundingText(
  materials: Array<{
    id: string;
    title: string;
    groundingMap: Record<string, unknown> | null;
  }>,
) {
  const parts: string[] = [];
  let total = 0;

  for (const material of materials) {
    const text = JSON.stringify({
      materialId: material.id,
      title: material.title,
      groundingMap: material.groundingMap ?? {},
    });
    if (!text) continue;

    const header = `\n\n=== SOURCE: ${material.title} ===\n\n`;
    const remaining = TOPIC_GROUNDING_PACK_MAX_INPUT_CHARS - total - header.length;
    if (remaining <= 0) break;

    const chunk = text.slice(0, Math.max(0, remaining));
    parts.push(header, chunk);
    total += header.length + chunk.length;
  }

  return parts.join("").trim();
}

export function packToRetrievedContextLines(pack: TopicGroundingPack): string[] {
  const lines: string[] = [];

  if (pack.digest.trim()) {
    lines.push(`Overview: ${pack.digest.trim()}`);
  }

  for (const section of pack.sections) {
    const points =
      section.keyPoints.length > 0
        ? ` Key points: ${section.keyPoints.join("; ")}`
        : "";
    lines.push(`[${section.title}] ${section.summary.trim()}${points}`);
  }

  for (const formula of pack.formulas) {
    lines.push(
      `Formula - ${formula.label}: ${formula.expression}` +
        (formula.conditions ? ` (when: ${formula.conditions})` : ""),
    );
  }

  return lines;
}

export function buildDeterministicTopicGroundingPack(params: {
  topicTitle: string;
  topicDescription?: string | null;
  boundary: TopicSourceBoundary;
  materialIds: string[];
  nextVersion: number;
  materials: Array<{
    id: string;
    title: string;
    groundingMap: MaterialGroundingMap | null;
  }>;
}) {
  const conceptMap = new Map<
    string,
    { name: string; summary: string; citations: GroundingCitation[] }
  >();
  const formulaMap = new Map<
    string,
    {
      id: string;
      label: string;
      expression: string;
      conditions: string;
      usageNotes: string;
      citations: GroundingCitation[];
    }
  >();
  const sectionMap = new Map<
    string,
    {
      id: string;
      title: string;
      summary: string;
      keyPoints: string[];
      citations: GroundingCitation[];
    }
  >();

  const notationRules: string[] = [];
  const rigorRules: string[] = [];
  const scopeRules: string[] = [];
  const explicitlyOutOfScope: string[] = [];
  const teachingNotes: string[] = [];
  const digestParts: string[] = [];

  for (const material of params.materials) {
    const groundingMap = material.groundingMap;
    if (!groundingMap) continue;

    if (groundingMap.overview.trim()) {
      digestParts.push(groundingMap.overview.trim());
    }

    notationRules.push(...groundingMap.notationRules);
    rigorRules.push(...groundingMap.rigorRules);
    scopeRules.push(...groundingMap.scopeRules);
    explicitlyOutOfScope.push(...groundingMap.explicitlyOutOfScope);
    teachingNotes.push(...groundingMap.teachingNotes, ...groundingMap.ambiguities);

    for (const concept of groundingMap.concepts) {
      const key = concept.name.trim().toLowerCase();
      if (!key) continue;
      const existing = conceptMap.get(key);
      conceptMap.set(key, {
        name: existing?.name ?? concept.name.trim(),
        summary: existing?.summary || concept.summary.trim(),
        citations: uniqueCitations([...(existing?.citations ?? []), ...concept.citations]),
      });
    }

    for (const formula of groundingMap.formulas) {
      const key = `${formula.label.trim().toLowerCase()}::${formula.expression.trim().toLowerCase()}`;
      if (!formula.label.trim() || !formula.expression.trim()) continue;
      const existing = formulaMap.get(key);
      formulaMap.set(key, {
        id: existing?.id ?? nanoid(),
        label: existing?.label ?? formula.label.trim(),
        expression: existing?.expression ?? formula.expression.trim(),
        conditions: existing?.conditions || formula.conditions.trim(),
        usageNotes: existing?.usageNotes || formula.usageNotes.trim(),
        citations: uniqueCitations([...(existing?.citations ?? []), ...formula.citations]),
      });
    }

    for (const section of groundingMap.sections) {
      const key = section.title.trim().toLowerCase();
      if (!key) continue;
      const existing = sectionMap.get(key);
      sectionMap.set(key, {
        id: existing?.id ?? section.id?.trim() ?? nanoid(),
        title: existing?.title ?? section.title.trim(),
        summary: existing?.summary || section.summary.trim(),
        keyPoints: uniqueStrings([...(existing?.keyPoints ?? []), ...section.keyPoints]),
        citations: uniqueCitations([...(existing?.citations ?? []), ...section.citations]),
      });
    }
  }

  const digest = uniqueStrings([
    params.boundary.teacherSummary,
    params.topicDescription ?? "",
    ...digestParts,
  ])
    .join(" ")
    .slice(0, 2_000);

  return mergePackWithBoundary(
    topicGroundingPackSchema.parse({
      version: params.nextVersion,
      builtAt: new Date().toISOString(),
      materialIds: params.materialIds,
      topicTitle: params.topicTitle,
      digest,
      inScopeConcepts: Array.from(conceptMap.values()),
      explicitlyOutOfScope: uniqueStrings(explicitlyOutOfScope),
      formulas: Array.from(formulaMap.values()),
      sections: Array.from(sectionMap.values()),
      notationRules: uniqueStrings(notationRules),
      rigorRules: uniqueStrings(rigorRules),
      scopeRules: uniqueStrings(scopeRules),
      teachingNotes: uniqueStrings(teachingNotes),
      conflictNotes: [],
      sourceSummaries: params.materials.map((material) => ({
        materialId: material.id,
        title: material.title,
        overview: material.groundingMap?.overview?.trim() ?? "",
      })),
    }),
    params.boundary,
  );
}
