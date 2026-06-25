import assert from "node:assert/strict";

import { normalizeRespondentTurnPayload } from "@/features/surveys/server/respondent-runtime-models";

function run() {
  const payload = normalizeRespondentTurnPayload({
    brief: {
      brief: {
        programId: "education.course_efficacy",
        title: "Course review",
        researchGoal: "Understand what changed for learners.",
        decisionToInform: "Decide whether to revise the course.",
        audienceDefinition: "Students who completed the course.",
        learningContext: "Online course",
        studyContext: "Follow-up interview",
        timeWindow: "This term",
        requiredTopics: [],
        successCriteria: [],
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
        routingRationale: "fixture",
        missingFields: [],
        readyForSampling: true,
        creationController: {
          version: 1,
          action: "complete",
          targetField: null,
          fieldQuality: [],
          askedFieldHistory: [],
          readinessRationale: "ready",
        },
      },
    },
    coveragePlan: {
      plan: {
        surveyId: "survey_1",
        programId: "education.course_efficacy",
        version: 1,
        nodes: [
          {
            id: "node_1",
            label: "Applied change",
            description: "What changed",
            priority: 1,
            completionThreshold: 0.8,
            requiredEvidenceTypes: [],
            probeFamilies: [],
            isRequired: true,
          },
        ],
        completionRule: {
          minimumRequiredNodeCoverage: 0.8,
          minimumReliability: 0.65,
        },
      },
    },
    sessionRow: {
      id: "session_1",
      sessionState: {
        sessionId: "session_1",
        surveyId: "survey_1",
        sessionType: "live",
        status: "active",
        language: "en",
        currentNodeId: "node_1",
        completedNodeIds: [],
        pendingNodeIds: ["node_1"],
        coverageByNode: { node_1: 0 },
        overallCoverage: 0,
        fatigueScore: 0,
        reliabilityScore: 0.8,
        contradictions: [],
        notes: [],
        respondentProfile: { preferences: [] },
        conversationSummary: "",
        summaryVersion: 0,
        activeWorkflowDecision: {
          activeNodeId: "node_1",
          rationale: "start",
          shouldStop: false,
        },
        contextBudgetSnapshot: {
          summaryTokens: 0,
          evidenceCount: 0,
          pendingNodeCount: 1,
        },
        needsHumanReview: false,
      },
    },
    canonicalTurn: {
      storedMessages: [],
      canonicalMessages: [],
      originalMessages: [],
      latestUserMessage: "",
      hasNewUserTurn: false,
    },
    surveyLanguage: "es",
  });

  assert.equal(payload.language, "es");
  assert.equal(payload.brief.title, "Course review");
  assert.equal(payload.coveragePlan.nodes[0]?.id, "node_1");
  assert.equal(payload.session.state.status, "active");

  assert.throws(() =>
    normalizeRespondentTurnPayload({
      brief: { brief: {} },
      coveragePlan: { plan: payload.coveragePlan },
      sessionRow: { id: "session_2", sessionState: payload.session.state },
      canonicalTurn: payload.turn,
      surveyLanguage: "en",
    }),
  );

  console.log("respondent-runtime normalization tests passed");
}

run();
