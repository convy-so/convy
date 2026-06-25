/**
 * Robustly extracts natural language responses from AI-generated JSON blocks.
 * Designed to handle complete JSON, partial streaming JSON, and multiple JSON blocks.
 * This file is purely functional and safe to use in both Client and Server components.
 * 
 * @param text The raw output from the AI (potentially containing JSON)
 * @returns The extracted natural language response(s)
 */
export function extractAIGeneratedResponse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const parseAllResponses = (textToParse: string) => {
    const responses: string[] = [];
    // Regex matches the value of the "response" field, handling escaped quotes
    const pattern = /"response"\s*:\s*"((?:[^"\\]|\\.)*)/g;
    let match;
    while ((match = pattern.exec(textToParse)) !== null) {
      if (typeof match[1] === 'string') {
        responses.push(match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
        );
      }
    }
    return responses;
  };

  // 1. Check for markdown-wrapped JSON blocks first (fallback for LLM drift)
  const mdMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/g);
  if (mdMatch) {
    const allExtracted: string[] = [];
    for (const block of mdMatch) {
      const content = block.replace(/```json\s*|\s*```/g, '');
      allExtracted.push(...parseAllResponses(content));
    }
    if (allExtracted.length > 0) return allExtracted.join('\n\n').trim();
  }

  // 2. Handle raw or concatenated JSON blocks (e.g., "{...}{...}")
  const allExtracted = parseAllResponses(trimmed);
  if (allExtracted.length > 0) {
    return allExtracted.join('\n\n').trim();
  }

  // 3. Fallback: If it looks like JSON but we haven't found a response yet,
  // return empty to avoid showing raw JSON structure to the user.
  if (trimmed.startsWith('{') && !trimmed.includes('"response"')) {
    return "";
  }

  // 4. Final Fallback: Return raw text (handle non-JSON agents or direct chat)
  return text;
}
