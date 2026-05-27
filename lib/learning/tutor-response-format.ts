function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function stripScratchpad(text: string) {
  return text.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, "").trim();
}

function hasBalancedCount(text: string, pattern: RegExp) {
  return countMatches(text, pattern) % 2 === 0;
}

export function normalizeTutorResponseText(text: string) {
  if (typeof text !== "string") return "";
  return stripScratchpad(text.replace(/\r\n?/g, "\n"));
}

export function analyzeTutorResponseText(text: string) {
  const normalized = normalizeTutorResponseText(text);

  return {
    hasScratchpad: /<scratchpad>/i.test(text),
    hasRawHtml: /<\/?[a-z][\s\S]*>/i.test(normalized),
    hasBalancedTripleBackticks: countMatches(normalized, /```/g) % 2 === 0,
    hasBalancedTildeFences: countMatches(normalized, /^~~~+/gm) % 2 === 0,
    hasBalancedInlineMath: hasBalancedCount(normalized, /(?<!\\)(?<!\$)\$(?!\$)/g),
    hasBalancedDisplayMath: hasBalancedCount(normalized, /(?<!\\)\$\$/g),
  };
}

export function formatTutorResponseWarnings(text: string) {
  const analysis = analyzeTutorResponseText(text);
  const warnings: string[] = [];

  if (analysis.hasScratchpad) warnings.push("scratchpad_leak");
  if (analysis.hasRawHtml) warnings.push("raw_html");
  if (!analysis.hasBalancedTripleBackticks) warnings.push("unbalanced_code_fence");
  if (!analysis.hasBalancedTildeFences) warnings.push("unbalanced_tilde_fence");
  if (!analysis.hasBalancedInlineMath) warnings.push("unbalanced_inline_math");
  if (!analysis.hasBalancedDisplayMath) warnings.push("unbalanced_display_math");

  return warnings;
}
