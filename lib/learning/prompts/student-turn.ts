import { formatFunctionalityGuidanceForPrompt } from "@/lib/learning/tutor-capabilities";
import { renderTopicGroundingPackForPrompt } from "@/lib/learning/topic-grounding-pack-render";
import type {
  CompiledFrameworkPolicy,
  ContentScopeSnapshot,
  ExpertTutorRuntimeModel,
  FrameworkState,
  StudentModelSnapshot,
} from "@/lib/learning/types";

function renderList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function renderFewShotExamples(label: string, examples: string[]) {
  if (!examples.length) {
    return `${label}:\n- none`;
  }

  return `${label}:\n${examples
    .map(
      (example, index) =>
        `- Example ${index + 1}:\n${example
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`,
    )
    .join("\n\n")}`;
}

function renderPhaseSummary(policy: CompiledFrameworkPolicy | null) {
  if (!policy) return "- none";

  return policy.phases
    .map(
      (phase) =>
        `- ${phase.label} (${phase.id}): ${phase.purpose || "no purpose provided"} | preferred moves: ${
          phase.preferredMoves.join(", ") || "none"
        }`,
    )
    .join("\n");
}

function renderLevelSummary(policy: CompiledFrameworkPolicy | null) {
  if (!policy) return "- none";

  return policy.levels
    .map(
      (level) =>
        `- ${level.label} (${level.id}): ${level.description || "no description provided"}`,
    )
    .join("\n");
}

function renderCompiledPolicySection(
  compiledPolicy: CompiledFrameworkPolicy | null,
  frameworkState: FrameworkState,
) {
  if (!compiledPolicy) {
    return `Framework runtime state:
- Current phase: ${frameworkState.currentPhaseId ?? "none"}
- Current level: ${frameworkState.currentLevelId ?? "none"}
- Diagnostic status: ${frameworkState.diagnosticStatus}
- Recommended next move: ${frameworkState.recommendedMove}
- Assessment pending: ${frameworkState.assessmentPending ? "yes" : "no"}
- Transfer pending: ${frameworkState.transferPending ? "yes" : "no"}
- Reflection pending: ${frameworkState.reflectionPending ? "yes" : "no"}
- Close requirements met: ${frameworkState.closeRequirementsMet ? "yes" : "no"}
- No compiled framework policy is active for this course. Follow the expert framework text, few-shot examples, and heuristics directly.`;
  }

  return `Compiled runtime policy:
- Summary: ${compiledPolicy.policySummary || "none"}
- Current phase: ${frameworkState.currentPhaseId ?? compiledPolicy.defaultPhaseId ?? "none"}
- Current level: ${frameworkState.currentLevelId ?? compiledPolicy.defaultLevelId ?? "none"}
- Diagnostic status: ${frameworkState.diagnosticStatus}
- Recommended next move: ${frameworkState.recommendedMove}
- Assessment pending: ${frameworkState.assessmentPending ? "yes" : "no"}
- Transfer pending: ${frameworkState.transferPending ? "yes" : "no"}
- Reflection pending: ${frameworkState.reflectionPending ? "yes" : "no"}
- Close requirements met: ${frameworkState.closeRequirementsMet ? "yes" : "no"}
- Framework phases:
${renderPhaseSummary(compiledPolicy)}
- Framework levels:
${renderLevelSummary(compiledPolicy)}
- Tool policy: course material grounding=session pack (fixed at start), images=${compiledPolicy.toolPolicy.images}, videos=${compiledPolicy.toolPolicy.videos}, quiz=${compiledPolicy.toolPolicy.structuredQuiz}, grading=${compiledPolicy.toolPolicy.formalGrading}, notebook uploads=${compiledPolicy.toolPolicy.notebookUploads}
- Completion policy: transfer=${compiledPolicy.completionPolicy.requireTransfer ? "required" : "optional"}, reflection=${compiledPolicy.completionPolicy.requireMetacognitiveReflection ? "required" : "optional"}, explicit understanding evidence=${compiledPolicy.completionPolicy.requireExplicitEvidenceOfUnderstanding ? "required" : "optional"}
- Review taxonomy:
${renderList(compiledPolicy.reviewTaxonomy)}`;
}

export function buildStudentTurnSystemPrompt(params: {
  contentScope: ContentScopeSnapshot;
  runtimeModel: ExpertTutorRuntimeModel;
  studentModel: StudentModelSnapshot;
  frameworkState: FrameworkState;
  studyLanguage: string;
}) {
  const compiledPolicy = params.runtimeModel.compiledPolicy;
  const groundingPackBlock = params.contentScope.topicGroundingPack
    ? renderTopicGroundingPackForPrompt(params.contentScope.topicGroundingPack)
    : null;

  return `You are Convy's tutor.

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

Reply in ${params.studyLanguage}.

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
    ? `- Topic grounding pack (authoritative source — loaded for this session; do not name files or upload types):\n${groundingPackBlock}`
    : `- Topic grounding pack: not compiled yet — stay within teacher summary and scope notes only.`
}

Published expert framework:
- Framework: ${params.runtimeModel.framework.name}
- Framework description: ${params.runtimeModel.framework.description}
- Tutor capability guidance:
${formatFunctionalityGuidanceForPrompt(params.runtimeModel.framework.functionalityGuidance) || "none"}
${
  params.runtimeModel.framework.markdownContent
    ? `- Framework Guidelines & Instructions:\n${params.runtimeModel.framework.markdownContent}`
    : renderFewShotExamples(
        "Framework reference examples",
        params.runtimeModel.framework.fewShotExamples.slice(0, 3),
      )
}

${renderCompiledPolicySection(compiledPolicy ?? null, params.frameworkState)}

Crystallized pedagogical heuristics:
${renderList(
  params.runtimeModel.heuristics.map(
    (heuristic) =>
      `${heuristic.title}: when ${heuristic.trigger}, ${heuristic.action}`,
  ),
)}

Student model (Dynamic Tracking):
- Cognitive Model (Open-Ended Conceptual Mastery & State):
${JSON.stringify(params.studentModel.cognitiveModel ?? {}, null, 2)}
- Personalization Profiles (Open-Ended Interests & Context):
${JSON.stringify(params.studentModel.personalization ?? {}, null, 2)}

Student model (Structured Calibration - Fallback):
- Motivations:
${renderList(params.studentModel.motivationalContext?.deeperMotivations ?? [])}
- Relevance hooks:
${renderList(params.studentModel.motivationalContext?.relevanceHooks ?? [])}
- Cognitive entry points:
${renderList(params.studentModel.cognitiveStyleCalibration?.preferredEntryPoints ?? [])}
- Productive struggle band: ${params.studentModel.productiveStruggleCalibration?.targetBand ?? "balanced"}
- Longitudinal signals:
${renderList(params.studentModel.longitudinalDevelopment?.betterQuestionSignals ?? [])}

Teaching rules:
- The topic grounding pack above is already loaded for this session. Use it for facts, notation, and formulas. Do not invent formulas or definitions that are not listed unless you are clearly teaching general pedagogy without factual claims.
- Never mention PDFs, slides, filenames, or how materials were uploaded.
- You can ask a structured quiz, accept notebook/photo evidence when appropriate, and return a formal graded evaluation when the framework calls for it.
- Stay inside the topic grounding pack and scope notes for concepts and claims.
- Follow the expert framework text, capability guidance, and heuristics together. If a compiled policy is present, it takes precedence for progression and completion.
- Respect the current framework phase and level unless the student's evidence justifies a move.
- If diagnosis-first is required by the framework or the active compiled policy, do not skip it.
- If the framework or compiled policy requires assessment, transfer, or reflection, do not close the session without them.
- Push for genuine understanding rather than accepting shallow compliance.
- Keep the student in productive struggle: challenging but not discouraging.
- Prefer one strong move per turn.
- When needed, ask a question instead of explaining.
- If the student is clearly stuck, give the minimum next support rather than the full answer.`;
}
