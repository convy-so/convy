import { nanoid } from "nanoid";

import {
  materialSourceDocumentSchema,
  materialSourceSegmentSchema,
  type GroundingCitation,
  type MaterialSourceDocument,
  type MaterialSourceSegment,
} from "@/features/tutoring/public-server";
import { MAX_TEXT_EXTRACTION_CHARS } from "@/shared/security/uploads";

import {
  MATERIAL_SEGMENT_MAX_CHARS,
  MATERIAL_SEGMENT_MIN_CHARS,
} from "./material-analysis-runtime";
import { requireValue } from "@/shared/utils/collections";

export function decodeTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").trim();
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function summarizeText(text: string, maxItems: number, maxCharsPerItem = 180) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item.length > maxCharsPerItem
        ? `${item.slice(0, maxCharsPerItem - 1).trim()}...`
        : item,
    )
    .slice(0, maxItems);
}

export function extractWorkedExamples(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        /example|worked example|practice|exercise|solve/i.test(line),
    )
    .slice(0, 3);
}

export function extractDefinitionCandidates(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^([^:]{2,80}):\s+(.{10,})$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .slice(0, 2);
}

function splitIntoBlocks(text: string) {
  return normalizeWhitespace(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function inferHeading(block: string) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const safeFirstLine = requireValue(firstLine, "Expected first line for heading inference");
  const markdownMatch = safeFirstLine.match(/^(#{1,6})\s+(.+)$/);
  if (markdownMatch) {
    const fenceHashes = requireValue(markdownMatch[1], "Expected markdown heading marker");
    const markdownTitle = requireValue(markdownMatch[2], "Expected markdown heading title");
    return {
      level: fenceHashes.length,
      title: markdownTitle.trim(),
      remainingText: lines.slice(1).join("\n").trim(),
    };
  }

  const numberedMatch = safeFirstLine.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
  if (numberedMatch && safeFirstLine.length <= 100) {
    const numbering = requireValue(numberedMatch[1], "Expected numbered heading marker");
    const numberedTitle = requireValue(numberedMatch[2], "Expected numbered heading title");
    const level = Math.min(numbering.split(".").length, 6);
    return {
      level,
      title: numberedTitle.trim(),
      remainingText: lines.slice(1).join("\n").trim(),
    };
  }

  if (
    lines.length === 1 &&
    safeFirstLine.length <= 80 &&
    /[A-Za-z]/.test(safeFirstLine) &&
    !/[.!?:]$/.test(safeFirstLine)
  ) {
    return {
      level: 2,
      title: safeFirstLine,
      remainingText: "",
    };
  }

  return null;
}

function applyHeadingPath(currentPath: string[], level: number, title: string) {
  const nextPath = currentPath.slice(0, Math.max(0, level - 1));
  nextPath[level - 1] = title;
  return nextPath.filter(Boolean);
}

function parsePdfPageMarker(block: string) {
  const match = block.match(/^\[\[PAGE\s+(\d+)\]\]$/im);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "", 10) || null;
}

export function buildSegmentsFromText(params: {
  materialId: string;
  sourceTitle: string;
  mimeType: string;
  extractor: string;
  sourceHash: string;
  extractedText: string;
}) {
  const blocks = splitIntoBlocks(params.extractedText);
  const segments: MaterialSourceSegment[] = [];
  let currentHeadingPath: string[] = [];
  let currentBlocks: string[] = [];
  let currentCharCount = 0;
  let currentPageStart: number | null = null;
  let currentPageEnd: number | null = null;

  const flush = () => {
    const text = normalizeWhitespace(currentBlocks.join("\n\n"));
    if (!text) return;

    segments.push(
      materialSourceSegmentSchema.parse({
        segmentId: nanoid(),
        order: segments.length,
        pageStart: currentPageStart,
        pageEnd: currentPageEnd ?? currentPageStart,
        headingPath: currentHeadingPath,
        text,
        charCount: text.length,
      }),
    );

    currentBlocks = [];
    currentCharCount = 0;
    currentPageStart = currentPageEnd;
  };

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const pageMarker = parsePdfPageMarker(block);
    if (pageMarker) {
      if (
        currentBlocks.length > 0 &&
        currentPageStart !== null &&
        pageMarker !== currentPageStart
      ) {
        currentPageEnd = currentPageStart;
      }
      if (currentPageStart === null) currentPageStart = pageMarker;
      currentPageEnd = pageMarker;
      continue;
    }

    const heading = inferHeading(block);
    let blockText = block;

    if (heading) {
      if (currentBlocks.length >= 1 && currentCharCount >= MATERIAL_SEGMENT_MIN_CHARS) {
        flush();
      }
      currentHeadingPath = applyHeadingPath(
        currentHeadingPath,
        heading.level,
        heading.title,
      );
      blockText = heading.remainingText;
      if (!blockText) continue;
    }

    const blockLength = blockText.length;
    if (
      currentBlocks.length > 0 &&
      currentCharCount + blockLength > MATERIAL_SEGMENT_MAX_CHARS
    ) {
      flush();
    }

    if (currentPageStart === null) {
      currentPageStart = currentPageEnd;
    }

    currentBlocks.push(blockText);
    currentCharCount += blockLength;
  }

  flush();

  const qualityFlags: string[] = [];
  if (segments.length === 0) qualityFlags.push("no_segments");
  if (segments.some((segment) => !segment.headingPath.length)) {
    qualityFlags.push("weak_heading_structure");
  }

  return materialSourceDocumentSchema.parse({
    materialId: params.materialId,
    sourceTitle: params.sourceTitle,
    mimeType: params.mimeType,
    extractor: params.extractor,
    sourceHash: params.sourceHash,
    extractedText: params.extractedText,
    qualityFlags,
    truncated: params.extractedText.length >= MAX_TEXT_EXTRACTION_CHARS,
    segments,
  });
}

export function flattenSourceDocumentText(sourceDocument: MaterialSourceDocument) {
  return sourceDocument.segments.map((segment) => segment.text).join("\n\n").trim();
}

export function buildCitation(params: {
  materialId: string;
  segment: MaterialSourceSegment;
}) {
  const snippet = params.segment.text.slice(0, 280).trim();
  return {
    materialId: params.materialId,
    segmentId: params.segment.segmentId,
    pageStart: params.segment.pageStart,
    pageEnd: params.segment.pageEnd,
    headingPath: params.segment.headingPath,
    snippet,
  } satisfies GroundingCitation;
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function mergeCitations(
  existing: GroundingCitation[],
  incoming: GroundingCitation[],
) {
  const seen = new Set<string>();
  const merged: GroundingCitation[] = [];

  for (const citation of [...existing, ...incoming]) {
    const key = [
      citation.materialId,
      citation.segmentId,
      citation.pageStart ?? "",
      citation.pageEnd ?? "",
      citation.snippet,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(citation);
  }

  return merged;
}

export function collectUniqueObjects<T extends { citations: GroundingCitation[] }>(
  values: T[],
  getKey: (value: T) => string,
) {
  const map = new Map<string, T>();

  for (const value of values) {
    const key = normalizeKey(getKey(value));
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, value);
      continue;
    }

    map.set(key, {
      ...existing,
      ...value,
      citations: mergeCitations(existing.citations, value.citations),
    });
  }

  return Array.from(map.values());
}
