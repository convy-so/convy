import assert from "node:assert/strict";

import { buildBudgetedContextBundle } from "@/lib/learning/context-engineering";
import { selectGroundingUnitsForPrompt } from "@/lib/learning/grounding-units";
import { buildTeacherEvidenceAnswerPrompt } from "@/lib/learning/prompts/evidence";
import { buildStudentTurnPromptRuntime } from "@/lib/learning/prompts/student-turn";
import type {
  ActiveExpertFramework,
  ContentScopeSnapshot,
  LearningSessionState,
  StudentInterestProfile,
} from "@/lib/learning/types";

function createContentScope(): ContentScopeSnapshot {
  return {
    topicId: "topic_1",
    topicTitle: "Quadratic Equations",
    contentLocale: "en",
    teacherSummary: "Factorising and solving basic quadratic equations.",
    materialIds: ["mat_1"],
    scopeNotes: ["Stay within single-variable quadratics."],
    notationNotes: ["Use x as the variable unless the student introduces another symbol."],
    rigorNotes: ["Show factoring steps before jumping to the roots."],
    retrievedContext: [
      "Overview: Factorising quadratics into binomials.",
      "[Worked example] Solve x^2 + 5x + 6 = 0 by factoring.",
    ],
    learningOutcomes: [
      {
        id: "outcome_1",
        title: "Solve quadratics by factoring",
        description: "Factor and solve monic quadratic equations.",
        evidenceSignals: [],
        misconceptionTags: [],
        masteryThreshold: 70,
      },
    ],
    groundingPackVersion: 3,
    topicGroundingPack: {
      version: 3,
      builtAt: "2026-05-28T00:00:00.000Z",
      materialIds: ["mat_1"],
      topicTitle: "Quadratic Equations",
      digest: "Quadratic equations can often be solved by factoring into two binomials.",
      inScopeConcepts: [
        {
          name: "Factorising a quadratic",
          summary: "Rewrite a quadratic as a product of two binomials.",
          citations: [],
        },
      ],
      explicitlyOutOfScope: ["Do not use the quadratic formula in this topic."],
      formulas: [
        {
          id: "formula_1",
          label: "Zero-product rule",
          expression: "(x + a)(x + b) = 0 => x = -a or x = -b",
          conditions: "After correct factorisation.",
          usageNotes: "Apply after the quadratic is written as a product.",
          citations: [],
        },
      ],
      sections: [
        {
          id: "section_1",
          title: "Factoring workflow",
          summary: "Find two numbers that multiply to the constant term and add to the coefficient of x.",
          keyPoints: [
            "Expand mentally to verify the factorisation.",
            "Only apply the zero-product rule after factoring.",
          ],
          citations: [],
        },
      ],
      notationRules: ["Write factors with parentheses."],
      rigorRules: ["Show the factor pair before stating the roots."],
      scopeRules: ["Stay with factorable monic quadratics."],
      teachingNotes: ["Prompt the student to check expansion if they are unsure."],
      conflictNotes: [],
      sourceSummaries: [
        {
          materialId: "mat_1",
          title: "Quadratics Notes",
          overview: "Introductory quadratics by factoring.",
        },
      ],
    },
  };
}

function createFramework(): ActiveExpertFramework {
  return {
    frameworkId: "framework_1",
    frameworkVersionId: "framework_version_1",
    seedSource: "expert_authored",
    framework: {
      name: "Socratic Math Tutoring",
      description: "Lead with diagnosis, then one precise nudge.",
      toolUsageGuidance: "Use tools only when they directly support diagnosis or checking work.",
      fewShotExamples: [
        "Student: I think the factors are x+2 and x+2. Tutor: Check the product and the middle term before we accept that.",
        "Student: I do not know what to multiply. Tutor: What two numbers multiply to 6 and add to 5?",
        "Student: Can I use the quadratic formula? Tutor: Not in this lesson. Let's stay with factoring.",
      ],
      markdownContent: "Start with the student's current idea, then ask one sharp question.",
      metadata: {},
    },
    heuristics: [
      {
        id: "heuristic_1",
        title: "Check the expansion",
        trigger: "the student proposes factors without verifying them",
        action: "ask the student to expand the factors and compare the middle term",
        rationale: "Verification reveals the precise error quickly.",
        examples: [],
        priority: "high",
        tags: [],
        relevanceScope: "framework_specific",
      },
    ],
    openConflicts: [],
  };
}

function createState(): LearningSessionState {
  return {
    topicId: "topic_1",
    topicTitle: "Quadratic Equations",
    frameworkVersionId: "framework_version_1",
    activeFrameworkSnapshot: createFramework(),
    groundingPackVersion: 3,
    contentScopeSnapshot: createContentScope(),
    recentMessageSummary: "Student tried factors that gave the wrong middle term.",
    recentEvidence: ["Student guessed (x+2)(x+2).", "Tutor asked for the product check."],
    tutorNotes: ["Student needs support checking the middle term."],
    turnCount: 4,
    reportReady: false,
    completed: false,
    completionRequestedAt: null,
  };
}

function createInterestProfile(): StudentInterestProfile {
  return {
    primaryInterests: [{ label: "Engineering", details: "Likes building things." }],
    aspirations: ["Study mechanical engineering"],
    curiosityAreas: ["How formulas connect to real machines"],
    motivationalStyle: ["personal_mastery"],
    learningRelationship: "positive",
    contextTags: ["analytical"],
    privateNotes: [],
    lastUpdated: "2026-05-28T00:00:00.000Z",
  };
}

function run() {
  const contentScope = createContentScope();
  const selectedUnits = selectGroundingUnitsForPrompt({
    contentScope,
    query: "How do I solve this equation after factoring?",
    recentSummary: "Student is trying to find the roots after factoring.",
    budgetTokens: 120,
    maxUnits: 4,
  });
  assert.ok(selectedUnits.length > 0, "expected grounding units to be selected");
  assert.ok(
    selectedUnits.some((unit) => unit.kind === "formula"),
    "expected a formula unit for a solving query",
  );
  assert.ok(
    selectedUnits.reduce((sum, unit) => sum + unit.tokenEstimate, 0) <= 120,
    "expected grounding selection to respect the token budget",
  );

  const promptRuntime = buildStudentTurnPromptRuntime({
    contentScope,
    activeFramework: createFramework(),
    interestProfile: createInterestProfile(),
    teachingPlaybook: null,
    memoryState: {
      status: "ready",
      message: "Use concrete examples before abstraction.",
    },
    state: createState(),
    recentMessages: [
      { role: "assistant", content: "What two numbers multiply to 6 and add to 5?" },
      { role: "user", content: "Maybe 2 and 3?" },
    ],
    latestUserText: "How do I solve it after I factor it?",
    studyLanguage: "en",
  });
  assert.ok(
    promptRuntime.staticSystemPrompt.includes("<role>"),
    "expected the static prompt to use the standard prompt frame",
  );
  assert.ok(
    promptRuntime.dynamicSystemPrompt.includes("<context_bundle"),
    "expected the tutoring runtime to wrap dynamic context in a context bundle",
  );
  assert.ok(
    !promptRuntime.dynamicSystemPrompt.includes("Topic grounding pack (authoritative source for this session):"),
    "expected tutoring to stop injecting the full grounding pack block",
  );
  assert.ok(
    promptRuntime.groundingUnits.length <= 8,
    "expected tutoring grounding retrieval to stay selective",
  );
  assert.ok(
    promptRuntime.promptCache?.namespace === "learning-tutor-chat",
    "expected tutoring prompt caching metadata to be attached",
  );

  const evidencePrompt = buildTeacherEvidenceAnswerPrompt({
    language: "en",
    studentName: "Ada",
    question: "What shows Ada is improving?",
    retrievedEvidence: [
      {
        sourceType: "report",
        sourceId: "report_1",
        score: 0.92,
        content: "Mastery improved from naming factors to solving correctly after checking expansion.",
        metadata: { topicTitle: "Quadratic Equations" },
      },
    ],
    uniqueReports: [],
    uniqueInteractions: [],
  });
  assert.ok(
    evidencePrompt.includes("<primary_evidence>"),
    "expected teacher evidence prompts to use tagged evidence blocks",
  );
  assert.ok(
    evidencePrompt.includes("report:report_1"),
    "expected source labels to be preserved in evidence prompts",
  );

  const bundle = buildBudgetedContextBundle({
    key: "test.bundle",
    maxTokens: 20,
    layers: [
      {
        kind: "product_policy",
        label: "Policy",
        content: "Short stable policy.",
        tokenBudget: 10,
      },
      {
        kind: "workflow_state",
        label: "State",
        content: "Line one.\nLine two.\nLine three.\nLine four.",
        tokenBudget: 6,
      },
      {
        kind: "memory",
        label: "Memory",
        content: "This layer should be dropped when the bundle is too large.",
        tokenBudget: 20,
      },
    ],
  });
  assert.ok(bundle.totalTokenEstimate <= 20, "expected the context bundle to respect the global budget");
  assert.ok(
    !bundle.rendered.includes("This layer should be dropped"),
    "expected lower-priority layers to drop first when over budget",
  );

  console.log("learning-prompt-runtime tests passed");
}

run();
