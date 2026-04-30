import type { SearchResult } from "@/lib/rag/search";

export function buildRerankerFallbackSystemPrompt(instruction: string): string {
  return `You are an expert search quality rater. Your task is to rank the following search results based on their relevance to the user's query.
Instruction: ${instruction}
Return the indices of the most relevant results, ordered from most relevant to least relevant.
Ignore results that are irrelevant to the query.`;
}

export function buildRerankerFallbackUserPrompt(input: {
  query: string;
  candidates: SearchResult[];
  topK: number;
}): string {
  return `Query: "${input.query}"

Results:
${input.candidates.map((candidate, index) => `[${index}] ${candidate.content.substring(0, 300)}...`).join("\n")}

Rank the top ${input.topK} results.`;
}
