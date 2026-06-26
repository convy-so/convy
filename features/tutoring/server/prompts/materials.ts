import { renderUntrustedContextBlock } from "@/shared/ai/scope-policy";

export const MATERIAL_SEGMENT_MAX_CHARS = 8_000;
export const MATERIAL_GROUNDING_MAP_MAX_CHARS = 32_000;
export const MATERIAL_COVERAGE_REVIEW_MAX_CHARS = 24_000;

export function buildMaterialSegmentGroundingPrompt(input: {
  lessonTitle: string;
  materialTitle: string;
  segmentOrder: number;
  headingPath: string[];
  pageStart?: number | null;
  pageEnd?: number | null;
  segmentText: string;
}) {
  const heading =
    input.headingPath.length > 0 ? input.headingPath.join(" > ") : "(none)";
  const pageLabel =
    input.pageStart && input.pageEnd
      ? input.pageStart === input.pageEnd
        ? `page ${input.pageStart}`
        : `pages ${input.pageStart}-${input.pageEnd}`
      : "(unknown)";

  return `You are extracting grounded teaching facts from one segment of a teacher-uploaded course document.

Lesson: ${input.lessonTitle}
Material title: ${input.materialTitle}
Segment order: ${input.segmentOrder}
Heading path: ${heading}
Page range: ${pageLabel}

Segment text:
${renderUntrustedContextBlock("lesson_material_segment", input.segmentText.slice(0, MATERIAL_SEGMENT_MAX_CHARS))}

Return only facts that are directly supported by this segment.

Rules:
- Do not infer learning outcomes.
- Do not judge whether the material is sufficient for the lesson.
- Prefer short, concrete extractions over narrative prose.
- If a category has no evidence, return an empty list.
- If wording is ambiguous, capture that in ambiguities instead of guessing.`;
}

export function buildMaterialGroundingMapPrompt(input: {
  lessonTitle: string;
  materialTitle: string;
  groundedSegmentsJson: string;
}) {
  return `You are compiling a full-document grounding map for one uploaded teaching material.

Lesson: ${input.lessonTitle}
Material title: ${input.materialTitle}

Grounded segment data:
${renderUntrustedContextBlock("material_grounding_segments", input.groundedSegmentsJson.slice(0, MATERIAL_GROUNDING_MAP_MAX_CHARS))}

Produce a grounded synthesis of the full material.

Rules:
- Use only the grounded segment data above.
- Preserve source fidelity; omit anything uncertain.
- Keep the overview concise and teacher-facing.
- Prefer section titles that reflect the actual teaching structure of the material.
- Do not mention filenames, PDFs, DOCX, uploads, or pages in prose fields.
- Teaching notes should focus on sequencing, common pitfalls, and emphasis implied by the material.`;
}

export function buildMaterialCoverageReviewPrompt(input: {
  lessonTitle: string;
  lessonDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialGroundingMapsJson: string;
}) {
  const outcomes = input.learningOutcomes
    .map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`)
    .join("\n");

  return `You are checking whether the uploaded teaching material can ground a tutoring session for the planned lesson outcomes.

Lesson: ${input.lessonTitle}
Description: ${input.lessonDescription ?? ""}

Planned learning outcomes:
${outcomes || "(none)"}

Grounding maps derived from the uploaded material:
${renderUntrustedContextBlock("material_grounding_maps", input.materialGroundingMapsJson.slice(0, MATERIAL_COVERAGE_REVIEW_MAX_CHARS))}

Return a teacher-facing coverage analysis.

Rules:
- Learning outcomes come from the lesson plan, not from the source material.
- Supported outcomes must be explicitly grounded by the material.
- Partial outcomes should note where support is incomplete.
- Unsupported outcomes should only include genuinely ungrounded expectations.
- Recommended outcome edits are only for vague or unsupported outcomes.
- Do not invent missing content from the material.`;
}

