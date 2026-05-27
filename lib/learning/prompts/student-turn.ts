import {
  renderTeachingPlaybookContext,
} from "@/lib/learning/patterns";
import { renderTopicGroundingPackForPrompt } from "@/lib/learning/topic-grounding-pack-render";
import { renderTutorPromptPolicy } from "@/lib/learning/tutor-policy";
import type {
  ActiveExpertFramework,
  ContentScopeSnapshot,
  StudentInterestProfile,
} from "@/lib/learning/types";
import type {
  LearningTeachingPlaybook,
} from "@/lib/learning/pattern-types";
import type { PatternMemoryState } from "@/lib/learning/pattern-memory-service";

function renderList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function renderFewShotExamples(examples: string[]) {
  if (!examples.length) {
    return "- none";
  }

  return examples
    .slice(0, 4)
    .map(
      (example, index) =>
        `- Example ${index + 1}:\n${example
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

function renderInterestProfile(profile: StudentInterestProfile | null | undefined) {
  if (!profile) {
    return "No interest profile is currently available.";
  }

  return [
    `Primary interests: ${profile.primaryInterests.map((item) => item.label).join(", ") || "none"}`,
    `Aspirations: ${profile.aspirations.join(", ") || "none"}`,
    `Curiosity areas: ${profile.curiosityAreas.join(", ") || "none"}`,
    `Motivational style: ${profile.motivationalStyle.join(", ") || "none"}`,
    `Learning relationship: ${profile.learningRelationship}`,
    `Context tags: ${profile.contextTags.join(", ") || "none"}`,
  ].join("\n");
}

function renderConflictSection(activeFramework: ActiveExpertFramework) {
  if (activeFramework.openConflicts.length === 0) {
    return "- none";
  }

  return activeFramework.openConflicts
    .map((conflict) => `- ${conflict.summary}`)
    .join("\n");
}

export function buildStudentTurnSystemPrompt(params: {
  contentScope: ContentScopeSnapshot;
  activeFramework: ActiveExpertFramework;
  interestProfile: StudentInterestProfile | null;
  teachingPlaybook: LearningTeachingPlaybook | null;
  memoryState: PatternMemoryState;
  studyLanguage: string;
}) {
  const groundingPackBlock = params.contentScope.topicGroundingPack
    ? renderTopicGroundingPackForPrompt(params.contentScope.topicGroundingPack)
    : null;
  const teachingPlaybookText = params.teachingPlaybook
    ? renderTeachingPlaybookContext(params.teachingPlaybook)
    : params.memoryState.message ?? "No long-horizon teaching playbook is available yet.";

  return `You are Convy's tutor.

Reply in ${params.studyLanguage}.

${renderTutorPromptPolicy()}

You are teaching inside a bounded course scope. The uploaded teacher materials define:
- what concepts are in scope
- what notation and rigor are allowed
- what problem space is allowed

You may use your own intelligence only for pedagogy:
- framing
- analogies
- examples
- pacing
- questioning
- emotional tone

You must not introduce new off-scope concepts, formulas, or unsupported rigor.

Course content scope:
- Topic: ${params.contentScope.topicTitle}
- Teacher summary: ${params.contentScope.teacherSummary || "none"}
- Scope notes:
${renderList(params.contentScope.scopeNotes)}
- Notation notes:
${renderList(params.contentScope.notationNotes)}
- Rigor notes:
${renderList(params.contentScope.rigorNotes)}
${
  groundingPackBlock
    ? `- Topic grounding pack (authoritative source for this session):\n${groundingPackBlock}`
    : `- Topic grounding pack: unavailable. Stay inside the teacher summary and scope notes only.`
}

Active expert framework:
- Framework: ${params.activeFramework.framework.name}
- Description: ${params.activeFramework.framework.description || "none"}
- Framework instructions:
${params.activeFramework.framework.markdownContent || "none"}
- Tool usage guide:
${params.activeFramework.framework.toolUsageGuidance || "none"}
- Framework few-shot examples:
${renderFewShotExamples(params.activeFramework.framework.fewShotExamples)}

Approved pedagogical heuristics:
${renderList(
  params.activeFramework.heuristics.map(
    (heuristic) =>
      `${heuristic.title}: when ${heuristic.trigger}, ${heuristic.action}`,
  ),
)}

Open expert conflicts to keep in mind:
${renderConflictSection(params.activeFramework)}

Student interest profile from the database:
${renderInterestProfile(params.interestProfile)}

Long-horizon teaching playbook from mem0:
${teachingPlaybookText}

Teaching rules:
- The topic grounding pack above is the authoritative source for facts, notation, and formulas.
- Never mention PDFs, slides, filenames, storage, uploads, or internal tooling.
- Stay inside the topic grounding pack and scope notes for concepts and claims.
- Follow the expert framework instructions, separate tool-usage guide, heuristics, and open conflicts together.
- Use the interest profile and teaching playbook to shape framing, examples, pacing, and challenge level.
- If memory is unavailable, continue tutoring normally without pretending you remember long-horizon patterns.
- Push for genuine understanding rather than shallow compliance.
- Prefer one strong move per turn.
- When needed, ask a question instead of explaining.
- If the student is clearly stuck, give the minimum next support rather than the full answer.`;
}
