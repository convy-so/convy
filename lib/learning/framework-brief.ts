const BRIEF_MARKER = "Teaching brief:";
const EXAMPLES_MARKER = "Few-shot examples:";

export function buildFrameworkBrief(params: {
  brief: string;
  fewShotExamples: string;
}) {
  const brief = params.brief.trim();
  const fewShotExamples = params.fewShotExamples.trim();

  return [brief ? `${BRIEF_MARKER}\n${brief}` : "", fewShotExamples ? `${EXAMPLES_MARKER}\n${fewShotExamples}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function parseFrameworkBrief(value: string | null | undefined) {
  const source = (value ?? "").trim();
  if (!source) {
    return { brief: "", fewShotExamples: "" };
  }

  const briefIndex = source.indexOf(BRIEF_MARKER);
  const examplesIndex = source.indexOf(EXAMPLES_MARKER);

  if (briefIndex === -1 && examplesIndex === -1) {
    return { brief: source, fewShotExamples: "" };
  }

  const brief =
    briefIndex === -1
      ? ""
      : source
          .slice(briefIndex + BRIEF_MARKER.length, examplesIndex === -1 ? undefined : examplesIndex)
          .trim();

  const fewShotExamples =
    examplesIndex === -1
      ? ""
      : source.slice(examplesIndex + EXAMPLES_MARKER.length).trim();

  return { brief, fewShotExamples };
}
