import type { RetrievalDocument } from "@/shared/ai/core/prompt-context-types";

export function dedupeRetrievalDocuments<T extends RetrievalDocument>(documents: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const document of documents) {
    const key = document.sourceId
      ? `${document.sourceType ?? "unknown"}:${document.sourceId}:${document.id}`
      : document.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(document);
  }

  return deduped;
}

export function budgetRetrievalDocuments<T extends RetrievalDocument>(
  documents: T[],
  budgetTokens = 1600,
) {
  const selected: T[] = [];
  let runningTokens = 0;

  for (const document of documents) {
    const content = document.retrievalContent ?? document.content;
    const estimatedTokens = Math.ceil(content.length / 4);
    if (selected.length > 0 && runningTokens + estimatedTokens > budgetTokens) {
      break;
    }
    selected.push(document);
    runningTokens += estimatedTokens;
  }

  return selected;
}
