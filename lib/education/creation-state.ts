import {
  isCreationMediaDecisionResolved,
  type CreationMediaDecision,
} from "@/lib/education/agent-tools";
import type {
  BriefValidationResult,
  CreationCollectedInfo,
  ResearchBrief,
} from "@/lib/education/types";

export function buildCreationCollectedInfo(input: {
  brief: ResearchBrief;
  validation: BriefValidationResult;
  mediaDecision: CreationMediaDecision;
}): CreationCollectedInfo {
  const readyForSampling = input.validation.isReady;

  return {
    objective: Boolean(input.brief.researchGoal),
    targetAudience: Boolean(input.brief.audienceDefinition),
    scope: input.brief.requiredTopics.length > 0,
    successCriteria: input.brief.successCriteria.length > 0,
    constraints: true,
    hypotheses: input.brief.assumptions.length > 0,
    tone: Boolean(input.brief.tone),
    requiredQuestions: input.brief.requiredQuestions.length > 0,
    metrics: input.brief.metrics.length > 0,
    personalInfo: input.brief.personalInfo.length > 0,
    subjectDefined: Boolean(input.brief.learningContext),
    programIdentified: Boolean(input.brief.programId),
    media: isCreationMediaDecisionResolved(input.mediaDecision),
    subjectModelComplete: readyForSampling,
  };
}

export function buildCreationExtractedData(input: {
  brief: ResearchBrief;
  validation: BriefValidationResult;
  mediaDecision: CreationMediaDecision;
}) {
  const readyForSampling = input.validation.isReady;

  return {
    programId: input.brief.programId,
    objective: {
      goal: input.brief.researchGoal,
      context: input.brief.learningContext,
      decision: input.brief.decisionToInform,
    },
    targetAudience: {
      description: input.brief.audienceDefinition,
      relationship: input.brief.audienceRelationship,
      knowledgeLevel: input.brief.audienceKnowledgeLevel,
    },
    scope: {
      breadthVsDepth: "balanced",
      mainTopics: input.brief.requiredTopics,
      boundaries: input.brief.studyContext,
    },
    successCriteria: {
      insightTypes: ["behavioral", "rational"],
      detailLevel: "high",
      description: input.brief.successCriteria.join(", "),
    },
    constraints: {
      timeLimit: null,
      sensitiveTopics: input.brief.riskFlags,
      otherConstraints: input.brief.constraints.join(", "),
    },
    tone: input.brief.tone,
    requiredQuestions: input.brief.requiredQuestions,
    metrics: input.brief.metrics,
    personalInfo: input.brief.personalInfo,
    brief: input.brief,
    creationController: input.brief.creationController,
    missingFields: input.validation.missingFields,
    fieldQuality: input.validation.fieldQuality,
    nextAction: input.validation.nextAction,
    targetField: input.validation.targetField,
    briefReadyForSampling: input.validation.isReady,
    readyForSampling,
    mediaDecision: input.mediaDecision,
  };
}
