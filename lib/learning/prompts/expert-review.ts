export function buildExpertReviewPrompt(params: {
  transcript: Array<{ role: string; content: string }>;
  expertCorrection: string;
}) {
  return `Turn this reviewed tutoring incident into a structured expert review case.

Transcript:
${JSON.stringify(params.transcript)}

Expert correction:
${params.expertCorrection}

Capture:
- what the tutor did wrong
- what tacit pedagogical knowledge the expert is surfacing
- whether this should become a reusable heuristic
- any conflict with the current framework`;
}
