import assert from "node:assert/strict";

import { buildConductingSystemPrompt } from "@/features/surveys/server/education/conducting-runtime";
import {
  createInitialSessionState,
} from "@/features/surveys/server/education/conducting-runtime/prompt-runtime";
import {
  deriveNextConductingSessionState,
  resolveConductingTurnPlan,
} from "@/features/surveys/server/education/conducting-runtime/turn-runtime";
import type { CoveragePlan, ResearchBrief } from "@/features/surveys/server/education/types";

function createBrief(): ResearchBrief {
  return {
    programId: "education.course_efficacy",
    title: "Teacher Workshop Review",
    researchGoal: "Understand what changed for teachers after the workshop.",
    decisionToInform: "Whether to revise the next cohort's design.",
    audienceDefinition: "Teachers who attended the workshop.",
    audienceRelationship: "",
    audienceKnowledgeLevel: "",
    learningContext: "Professional development workshops for teachers.",
    studyContext: "Post-program qualitative interviews.",
    timeWindow: "Within two weeks of the workshop.",
    requiredTopics: ["applied change", "barriers", "most useful elements"],
    successCriteria: ["Clear examples of behavior change", "Practical constraints surfaced"],
    analysisQuestions: [],
    requiredQuestions: [],
    metrics: [],
    personalInfo: [],
    riskFlags: [],
    constraints: [],
    assumptions: [],
    tone: "casual",
    media: [],
    routingConfidence: 1,
    routingRationale: "Direct match",
    missingFields: [],
    readyForSampling: true,
    creationController: {
      version: 1,
      action: "complete",
      targetField: null,
      fieldQuality: [],
      askedFieldHistory: [],
      readinessRationale: "Fixture is complete.",
    },
  };
}

function createCoveragePlan(): CoveragePlan {
  return {
    surveyId: "survey_1",
    programId: "education.course_efficacy",
    version: 1,
    nodes: [
      {
        id: "n1",
        label: "Applied change",
        description: "What the participant changed in practice after the program.",
        priority: 1,
        completionThreshold: 0.8,
        requiredEvidenceTypes: ["behavioral-example"],
        probeFamilies: ["example", "mechanism"],
        isRequired: true,
      },
      {
        id: "n2",
        label: "Barriers",
        description: "What made the new practice difficult to sustain.",
        priority: 0.8,
        completionThreshold: 0.7,
        requiredEvidenceTypes: ["barrier"],
        probeFamilies: ["barrier", "confidence"],
        isRequired: true,
      },
    ],
    completionRule: {
      minimumRequiredNodeCoverage: 0.75,
      minimumReliability: 0.65,
    },
  };
}

function testFewShotPromptCoverage() {
  const brief = createBrief();
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_1",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });

  const prompt = buildConductingSystemPrompt({
    brief,
    coveragePlan,
    sessionState,
    sessionType: "live",
    turnPlan: {
      action: "probe_same_node",
      targetNodeId: "n1",
      probeType: "example",
      reason: "Need one concrete episode.",
      missingEvidence: ["specific moment"],
      avoidRepeating: ["What was most useful?"],
    },
    toolContext: { canFinishSurvey: true },
  });

  assert.ok(
    prompt.includes("<few-shot-examples>"),
    "expected conducting prompt to include few-shot examples",
  );
  assert.ok(
    prompt.includes("Scenario: do not probe when the evidence is already concrete"),
    "expected a few-shot example for avoiding unnecessary probing",
  );
  assert.ok(
    prompt.includes("Scenario: close instead of fishing for more"),
    "expected a few-shot example for stopping cleanly",
  );
  assert.ok(
    prompt.includes("<turn-plan>"),
    "expected prompt runtime to inject the structured turn plan",
  );
}

function testThresholdCompletionAdvancesNode() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_2",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });

  const { nextState, shouldStop } = deriveNextConductingSessionState({
    coveragePlan,
    sessionState,
    messages: [
      { role: "assistant", content: "Tell me about a time the workshop changed your teaching." },
      {
        role: "user",
        content:
          "After the workshop I switched my feedback routine, and students started asking for help earlier because the check-ins felt safer.",
      },
    ],
    analysis: {
      nodeCoverage: { n1: 0.85, n2: 0.2 },
      completedNodeIds: [],
      fatigueScore: 0.2,
      reliabilityScore: 0.78,
      shouldStop: false,
      notes: ["Concrete behavior change captured."],
    },
  });

  assert.deepEqual(
    nextState.completedNodeIds.sort(),
    ["n1"],
    "expected threshold coverage to auto-complete the active node",
  );
  assert.equal(
    nextState.currentNodeId,
    "n2",
    "expected runtime to advance to the next open node after threshold completion",
  );
  assert.equal(shouldStop, false, "expected the interview to continue when another required node remains");
}

function testDoNotStopWithLowReliability() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_3",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });

  const { nextState, shouldStop } = deriveNextConductingSessionState({
    coveragePlan,
    sessionState,
    messages: [
      { role: "assistant", content: "Anything else?" },
      { role: "user", content: "No, that is all." },
    ],
    analysis: {
      nodeCoverage: { n1: 0.9, n2: 0.8 },
      completedNodeIds: ["n1", "n2"],
      fatigueScore: 0.4,
      reliabilityScore: 0.5,
      shouldStop: true,
      notes: ["Coverage looks high but evidence is still weak."],
    },
  });

  assert.equal(
    shouldStop,
    false,
    "expected stop to be blocked when reliability is below the minimum threshold",
  );
  assert.equal(nextState.status, "active", "expected session to remain active under low reliability");
}

function testFatigueForcedStop() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_4",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });

  const { nextState, shouldStop, fatigueForcedStop } = deriveNextConductingSessionState({
    coveragePlan,
    sessionState,
    messages: [
      { role: "assistant", content: "Can you say more?" },
      { role: "user", content: "I need to leave now." },
    ],
    analysis: {
      nodeCoverage: { n1: 0.45, n2: 0.3 },
      fatigueScore: 0.92,
      reliabilityScore: 0.72,
      shouldStop: true,
      notes: ["Participant is clearly done."],
    },
  });

  assert.equal(fatigueForcedStop, true, "expected high fatigue to force a stop path");
  assert.equal(shouldStop, true, "expected session to stop when fatigue is very high");
  assert.equal(nextState.status, "completed", "expected completed status on forced stop");
  assert.equal(nextState.stopReason, "analysis_stop_signal");
}

function testResolvePlanFallsBackToCloseWhenCoverageReady() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_5",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });
  sessionState.coverageByNode = { n1: 0.9, n2: 0.85 };
  sessionState.completedNodeIds = ["n1", "n2"];
  sessionState.pendingNodeIds = [];
  sessionState.currentNodeId = null;
  sessionState.overallCoverage = 0.875;
  sessionState.reliabilityScore = 0.8;

  const resolvedPlan = resolveConductingTurnPlan({
    coveragePlan,
    sessionState,
    messages: [{ role: "user", content: "That is all from me." }],
    plan: null,
  });

  assert.equal(resolvedPlan.action, "close");
  assert.ok(
    !resolvedPlan.assistantMessage.includes("?"),
    "expected close fallback to produce a non-question closing message",
  );
}

function testResolvePlanRewritesRepeatedQuestionShape() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_6",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });

  const resolvedPlan = resolveConductingTurnPlan({
    coveragePlan,
    sessionState,
    messages: [
      { role: "assistant", content: "Can you share one specific example of applied change in practice?" },
      { role: "user", content: "I started using check-ins." },
    ],
    plan: {
      action: "probe_same_node",
      targetNodeId: "n1",
      probeType: "example",
      reason: "Need more evidence.",
      missingEvidence: ["another example"],
      avoidRepeating: [],
      assistantMessage: "Can you share one specific example of applied change in practice?",
      completionReadiness: 0.4,
      fatigueLevel: "low",
    },
  });

  assert.equal(resolvedPlan.action, "probe_same_node");
  assert.notEqual(
    resolvedPlan.assistantMessage,
    "Can you share one specific example of applied change in practice?",
    "expected the resolver to rewrite a repeated question shape",
  );
  assert.ok(
    resolvedPlan.assistantMessage.includes("?"),
    "expected non-close plans to still produce exactly one question shape",
  );
}

function testResolvePlanUpgradesCoveredProbeToAdvance() {
  const coveragePlan = createCoveragePlan();
  const sessionState = createInitialSessionState({
    surveyId: coveragePlan.surveyId,
    sessionId: "session_7",
    sessionType: "live",
    language: "en",
    coveragePlan,
  });
  sessionState.coverageByNode = { n1: 0.85, n2: 0.1 };
  sessionState.overallCoverage = 0.475;

  const resolvedPlan = resolveConductingTurnPlan({
    coveragePlan,
    sessionState,
    messages: [{ role: "user", content: "I already explained the main change." }],
    plan: {
      action: "probe_same_node",
      targetNodeId: "n1",
      probeType: "example",
      reason: "Probe again.",
      missingEvidence: [],
      avoidRepeating: [],
      assistantMessage: "Can you share one specific example of applied change in practice?",
      completionReadiness: 0.5,
      fatigueLevel: "low",
    },
  });

  assert.equal(resolvedPlan.action, "advance_to_node");
  assert.equal(resolvedPlan.targetNodeId, "n2");
}

function run() {
  testFewShotPromptCoverage();
  testThresholdCompletionAdvancesNode();
  testDoNotStopWithLowReliability();
  testFatigueForcedStop();
  testResolvePlanFallsBackToCloseWhenCoverageReady();
  testResolvePlanRewritesRepeatedQuestionShape();
  testResolvePlanUpgradesCoveredProbeToAdvance();
  console.log("conducting-runtime regression tests passed");
}

run();
