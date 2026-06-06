import type {
  ContentScopeSnapshot,
  TopicGroundingPack,
} from "@/lib/learning/types";

export type GroundingUnitKind =
  | "digest"
  | "concept"
  | "formula"
  | "section"
  | "scope_rule"
  | "notation_rule"
  | "rigor_rule"
  | "teaching_note"
  | "out_of_scope";

export type GroundingUnit = {
  id: string;
  kind: GroundingUnitKind;
  title: string;
  content: string;
  priority: number;
  keywords: string[];
  tokenEstimate: number;
};

function estimateTokens(value: string) {
  const trimmed = value.trim();
  return trimmed ? Math.ceil(trimmed.length / 4) : 0;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      normalizeText(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 3),
    ),
  );
}

function buildUnit(
  id: string,
  kind: GroundingUnitKind,
  title: string,
  content: string,
  priority: number,
  keywords: string[],
): GroundingUnit | null {
  const normalized = normalizeText(content);
  if (!normalized) return null;

  return {
    id,
    kind,
    title: normalizeText(title) || kind,
    content: normalized,
    priority,
    keywords: Array.from(new Set(keywords.filter(Boolean))),
    tokenEstimate: estimateTokens(normalized),
  };
}

export function buildGroundingUnitsFromPack(
  pack: TopicGroundingPack | null | undefined,
): GroundingUnit[] {
  if (!pack) return [];

  const units: GroundingUnit[] = [];
  const digest = buildUnit(
    "digest",
    "digest",
    "Topic digest",
    pack.digest,
    40,
    tokenize(pack.digest),
  );
  if (digest) units.push(digest);

  for (const concept of pack.inScopeConcepts) {
    const unit = buildUnit(
      `concept:${concept.name.toLowerCase()}`,
      "concept",
      concept.name,
      `${concept.name}: ${concept.summary}`,
      48,
      tokenize(`${concept.name} ${concept.summary}`),
    );
    if (unit) units.push(unit);
  }

  for (const formula of pack.formulas) {
    const unit = buildUnit(
      `formula:${formula.id}`,
      "formula",
      formula.label,
      [
        `${formula.label}: ${formula.expression}`,
        formula.conditions ? `Conditions: ${formula.conditions}` : null,
        formula.usageNotes ? `Usage notes: ${formula.usageNotes}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      55,
      tokenize(
        `${formula.label} ${formula.expression} ${formula.conditions} ${formula.usageNotes}`,
      ),
    );
    if (unit) units.push(unit);
  }

  for (const section of pack.sections) {
    const unit = buildUnit(
      `section:${section.id}`,
      "section",
      section.title,
      [
        `${section.title}: ${section.summary}`,
        section.keyPoints.length
          ? `Key points: ${section.keyPoints.join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" | "),
      45,
      tokenize(
        `${section.title} ${section.summary} ${section.keyPoints.join(" ")}`,
      ),
    );
    if (unit) units.push(unit);
  }

  for (const [index, rule] of pack.scopeRules.entries()) {
    const unit = buildUnit(
      `scope:${index}`,
      "scope_rule",
      "Scope rule",
      rule,
      60,
      tokenize(rule),
    );
    if (unit) units.push(unit);
  }

  for (const [index, rule] of pack.notationRules.entries()) {
    const unit = buildUnit(
      `notation:${index}`,
      "notation_rule",
      "Notation rule",
      rule,
      58,
      tokenize(rule),
    );
    if (unit) units.push(unit);
  }

  for (const [index, rule] of pack.rigorRules.entries()) {
    const unit = buildUnit(
      `rigor:${index}`,
      "rigor_rule",
      "Rigor rule",
      rule,
      57,
      tokenize(rule),
    );
    if (unit) units.push(unit);
  }

  for (const [index, note] of pack.teachingNotes.entries()) {
    const unit = buildUnit(
      `teaching:${index}`,
      "teaching_note",
      "Teaching note",
      note,
      34,
      tokenize(note),
    );
    if (unit) units.push(unit);
  }

  for (const [index, note] of pack.explicitlyOutOfScope.entries()) {
    const unit = buildUnit(
      `out:${index}`,
      "out_of_scope",
      "Out of scope",
      note,
      59,
      tokenize(note),
    );
    if (unit) units.push(unit);
  }

  return units;
}

function buildQueryTokens(input: {
  query: string;
  recentSummary?: string | null;
  fallbackKeywords?: string[];
}) {
  return Array.from(
    new Set([
      ...tokenize(input.query),
      ...tokenize(input.recentSummary ?? ""),
      ...(input.fallbackKeywords ?? []),
    ]),
  );
}

function scoreUnit(unit: GroundingUnit, queryTokens: string[], queryText: string) {
  let score = unit.priority;
  if (queryTokens.length === 0) {
    return score;
  }

  const lowerContent = unit.content.toLowerCase();
  const lowerTitle = unit.title.toLowerCase();
  let overlap = 0;

  for (const token of queryTokens) {
    if (unit.keywords.includes(token)) overlap += 3;
    if (lowerTitle.includes(token)) overlap += 2;
    if (lowerContent.includes(token)) overlap += 1;
  }

  score += overlap;

  if (
    unit.kind === "formula" &&
    /[=+\-/*^()]|\bformula\b|\bequation\b|\bsolve\b/i.test(queryText)
  ) {
    score += 8;
  }

  if (
    unit.kind === "out_of_scope" &&
    /\bcan i\b|\bwhat about\b|\boutside\b|\binstead\b/i.test(queryText)
  ) {
    score += 6;
  }

  if (
    unit.kind === "scope_rule" &&
    /\bshould\b|\ballowed\b|\bin scope\b|\buse\b/i.test(queryText)
  ) {
    score += 4;
  }

  return score;
}

function arrangeForPrompt(units: GroundingUnit[]) {
  if (units.length <= 2) return units;

  const [first, second, ...rest] = units;
  return [first, ...rest, second];
}

export function selectGroundingUnitsForPrompt(input: {
  contentScope: ContentScopeSnapshot;
  query: string;
  recentSummary?: string | null;
  budgetTokens?: number;
  maxUnits?: number;
}) {
  const packUnits = buildGroundingUnitsFromPack(input.contentScope.topicGroundingPack);
  const fallbackUnits =
    packUnits.length > 0
      ? packUnits
      : input.contentScope.retrievedContext.map((item, index) => ({
          id: `legacy:${index}`,
          kind: "section" as const,
          title: `Grounding ${index + 1}`,
          content: normalizeText(item),
          priority: index === 0 ? 40 : 34,
          keywords: tokenize(item),
          tokenEstimate: estimateTokens(item),
        }));

  const queryTokens = buildQueryTokens({
    query: input.query,
    recentSummary: input.recentSummary,
    fallbackKeywords: tokenize(
      [
        input.contentScope.topicTitle,
        input.contentScope.teacherSummary,
        ...input.contentScope.learningOutcomes.map((item) => item.title),
      ].join(" "),
    ),
  });

  const ranked = [...fallbackUnits]
    .map((unit) => ({
      unit,
      score: scoreUnit(unit, queryTokens, input.query),
    }))
    .sort((left, right) => right.score - left.score);

  const maxUnits = input.maxUnits ?? 8;
  const budgetTokens = input.budgetTokens ?? 1_200;
  const selected: GroundingUnit[] = [];
  let runningTokens = 0;

  for (const { unit } of ranked) {
    if (selected.some((existing) => existing.id === unit.id)) continue;
    if (selected.length >= maxUnits) break;
    if (
      selected.length > 0 &&
      runningTokens + unit.tokenEstimate > budgetTokens
    ) {
      continue;
    }

    selected.push(unit);
    runningTokens += unit.tokenEstimate;
  }

  if (selected.length === 0 && ranked[0]) {
    selected.push(ranked[0].unit);
  }

  return arrangeForPrompt(selected);
}
