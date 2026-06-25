import assert from "node:assert/strict";

import {
  createBootingVoiceState,
  createClosedVoiceState,
  createReadyVoiceState,
  isReadyVoiceState,
  requireReadyVoiceState,
} from "@/features/surveys/realtime/survey-response-voice-state";

function run() {
  const bootingState = createBootingVoiceState({
    surveyLookupKey: "shareable-link",
    conversationId: "conversation_1",
    voiceSessionId: "voice_1",
    language: "en",
  });

  assert.equal(isReadyVoiceState(bootingState), false);
  assert.throws(() => requireReadyVoiceState(bootingState));

  const readyState = createReadyVoiceState({
    survey: {
      id: "survey_1",
      userId: "user_1",
      title: "Teacher workshop review",
      classroomId: null,
      programId: "education.course_efficacy",
      tone: "casual",
      requiredQuestions: [],
    },
    conversationId: "conversation_1",
    voiceSessionId: "voice_1",
    participantId: "participant_1",
    messages: [],
    language: "en",
    brief: {
      programId: "education.course_efficacy",
      title: "Teacher workshop review",
      researchGoal: "Understand what changed for teachers.",
      decisionToInform: "Revise the next workshop run.",
      audienceDefinition: "Teachers",
      learningContext: "Professional development",
      studyContext: "Interview",
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
    coveragePlan: {
      surveyId: "survey_1",
      programId: "education.course_efficacy",
      version: 1,
      nodes: [],
      completionRule: {
        minimumRequiredNodeCoverage: 0.8,
        minimumReliability: 0.65,
      },
    },
    sessionId: "session_1",
    sessionState: {
      sessionId: "session_1",
      surveyId: "survey_1",
      sessionType: "live",
      status: "active",
      language: "en",
      currentNodeId: null,
      completedNodeIds: [],
      pendingNodeIds: [],
      coverageByNode: {},
      overallCoverage: 0,
      fatigueScore: 0,
      reliabilityScore: 0.8,
      contradictions: [],
      notes: [],
      respondentProfile: { preferences: [] },
      conversationSummary: "",
      summaryVersion: 0,
      activeWorkflowDecision: {
        activeNodeId: null,
        rationale: "start",
        shouldStop: false,
      },
      contextBudgetSnapshot: {
        summaryTokens: 0,
        evidenceCount: 0,
        pendingNodeCount: 0,
      },
      needsHumanReview: false,
    },
    ownerId: "user_1",
  });

  assert.equal(isReadyVoiceState(readyState), true);
  assert.equal(requireReadyVoiceState(readyState).sessionId, "session_1");

  const closedState = createClosedVoiceState(readyState);
  assert.equal(closedState.phase, "closed");
  assert.equal(closedState.surveyId, "survey_1");

  console.log("survey-response-voice state tests passed");
}

run();
