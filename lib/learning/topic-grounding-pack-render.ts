import type { TopicGroundingPack } from "@/lib/learning/types";

export function renderTopicGroundingPackForPrompt(pack: TopicGroundingPack): string {
  const sections = pack.sections
    .map((section) => {
      const points = section.keyPoints.map((point) => `  - ${point}`).join("\n");
      return `- ${section.title}: ${section.summary}${points ? `\n${points}` : ""}`;
    })
    .join("\n");

  const concepts = pack.inScopeConcepts
    .map((concept) => `- ${concept.name}: ${concept.summary}`)
    .join("\n");

  const formulas = pack.formulas
    .map((formula) => {
      const parts = [
        `- ${formula.label}: ${formula.expression}`,
        formula.conditions ? `  Conditions: ${formula.conditions}` : null,
        formula.usageNotes ? `  Notes: ${formula.usageNotes}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n");

  const renderRules = (label: string, rules: string[]) =>
    rules.length ? `${label}:\n${rules.map((rule) => `- ${rule}`).join("\n")}` : `${label}: none`;

  return [
    pack.digest.trim() ? `Digest:\n${pack.digest.trim()}` : "Digest: none",
    concepts ? `In-scope concepts:\n${concepts}` : "In-scope concepts: none",
    pack.explicitlyOutOfScope.length
      ? `Explicitly out of scope:\n${pack.explicitlyOutOfScope.map((item) => `- ${item}`).join("\n")}`
      : "Explicitly out of scope: none",
    formulas
      ? `Authoritative formulas (use exactly; do not invent others):\n${formulas}`
      : "Authoritative formulas: none",
    sections ? `Teaching sections:\n${sections}` : "Teaching sections: none",
    renderRules("Notation rules", pack.notationRules),
    renderRules("Rigor rules", pack.rigorRules),
    renderRules("Scope rules", pack.scopeRules),
    pack.teachingNotes.length
      ? `Teaching notes:\n${pack.teachingNotes.map((note) => `- ${note}`).join("\n")}`
      : "Teaching notes: none",
  ].join("\n\n");
}
