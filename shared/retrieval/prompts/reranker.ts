import type { SearchResult } from "@/shared/retrieval/types";

export function buildRerankerFallbackSystemPrompt(
  instruction: string,
): string {
  return [
    "You are a retrieval reranker.",
    instruction,
    "Return rankedIndices only.",
    "Each index must refer to the zero-based candidate position.",
    "Do not invent indices and do not include commentary.",
  ].join("\n");
}

export function buildRerankerFallbackUserPrompt(input: {
  query: string;
  candidates: SearchResult[];
  topK: number;
}): string {
  const renderedCandidates = input.candidates.map((candidate, index) => {
    const metadata = Object.entries(candidate.metadata)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");

    return [
      `Index: ${index}`,
      `Source Type: ${candidate.sourceType}`,
      candidate.sourceId ? `Source ID: ${candidate.sourceId}` : null,
      metadata ? `Metadata: ${metadata}` : null,
      "Content:",
      candidate.content,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `Query: ${input.query}`,
    `Top K: ${input.topK}`,
    "",
    "Candidates:",
    renderedCandidates.join("\n\n---\n\n"),
    "",
    "Rank the candidates from most relevant to least relevant.",
  ].join("\n");
}
