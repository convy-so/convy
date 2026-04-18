import { Output } from "ai";
import { z } from "zod";

import { analysisModel, defaultModel } from "@/lib/ai";
import { generateObservedText } from "@/lib/ai/observed-text";
import { recordAiStep } from "@/lib/ai/observability";
import { normalizeAppLocale } from "@/lib/i18n/config";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import {
  TUTORING_ANALYSIS_SYSTEM_PROMPT,
  TUTORING_DEFAULT_SYSTEM_PROMPT,
  buildTutoringObservedOptions,
  buildTutoringPromptCache,
  renderLearningStateSnapshot,
  renderRetrievedContext,
  renderStudentProfileContext,
  renderTeachingPlaybookSummary,
  type TutoringPromptRuntimeContext,
} from "@/lib/learning/prompting";
import { findLearningEvidenceContext } from "@/lib/learning/evidence";
import { generateSessionOpening } from "@/lib/learning/tutor";
import {
  assessmentQuestionTypeSchema,
  assessmentReasoningSkillSchema,
  getDefaultChallengeSequence,
  getSubjectPackage,
  type AssessmentQuestionType,
} from "@/lib/learning/subject-packages";
import {
  conceptConfidenceSchema,
  homeworkStatusSchema,
  learningAssessmentItemSchema,
  learningQuizItemSchema,
  metacognitiveMirrorStateSchema,
  learningReflectionStateSchema,
  learningSessionPhaseSchema,
  learningSessionStateSchema,
  reasoningPatternSignalSchema,
  questionIntentSchema,
  quizDifficultySchema,
  type LearningAssessmentItem,
  type GradeBand,
  type LearningOutcomeDefinition,
  type LearningSessionPhase,
  type LearningSessionState,
  type QuestionIntent,
  type StudentInterestProfile,
  type TeacherProgressReport,
  type TopicSourceBoundary,
} from "@/lib/learning/types";

export type TutoringRuntimeContext = TutoringPromptRuntimeContext;

function renderTutoringRuntimeContext(context?: TutoringRuntimeContext) {
  if (!context) return "";

  const studyLanguage =
    typeof context.metadata?.studyLanguage === "string"
      ? context.metadata.studyLanguage
      : null;
  const sourceContentLanguage =
    typeof context.metadata?.sourceContentLanguage === "string"
      ? context.metadata.sourceContentLanguage
      : null;
  const sections = [
    studyLanguage
      ? `Language policy:\n- Write every student-facing response in ${studyLanguage}.\n- If the student writes in a different supported language, adapt to that language for the reply while staying grounded in the same source material.`
      : null,
    sourceContentLanguage
      ? `Grounding language:\n- Teacher-approved source material is anchored in ${sourceContentLanguage}.\n- Use it for facts even when the student-facing reply is in another supported language.`
      : null,
    context.expertGuidance
      ? `Expert guidance:\n${context.expertGuidance}`
      : null,
    context.socialGuidance
      ? `Social tutoring guidance:\n${context.socialGuidance}`
      : null,
    context.memoryContext
      ? `Personalization memory:\n${context.memoryContext}`
      : null,
    context.userOverlay
      ? `User add-ons:\n${context.userOverlay}`
      : null,
  ].filter(Boolean);

  return sections.length > 0 ? `${sections.join("\n\n")}\n\n` : "";
}

const probeEvaluationSchema = z.object({
  strength: z.enum(["strong", "partial", "weak"]),
  feedback: z.string(),
  gap: z.string().nullable().default(null),
});

const continuityEvaluationSchema = z.object({
  homeworkStatus: homeworkStatusSchema,
  feedback: z.string(),
  gap: z.string().nullable().default(null),
});

const questionIntentEnvelopeSchema = z.object({
  intent: questionIntentSchema,
  reason: z.string(),
});

const conceptIntroSchema = z.object({
  explanation: z.string(),
  analogy: z.string(),
  technicalVocabulary: z.string(),
  realWorldAnchor: z.string(),
  comprehensionQuestion: z.string(),
});

const conceptComprehensionSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  confidence: conceptConfidenceSchema,
  feedback: z.string(),
  gap: z.string().nullable().default(null),
  alternativeExplanation: z.string().default(""),
  alternativeAnalogy: z.string().default(""),
  nextQuestion: z.string(),
});

const deepeningEvaluationSchema = z.object({
  readyToAdvance: z.boolean(),
  feedback: z.string(),
  bridge: z.string(),
});

const assessmentQuestionSchema = z.object({
  prompt: z.string(),
  expectedAnswer: z.string(),
  explanation: z.string(),
  difficulty: quizDifficultySchema,
  questionType: assessmentQuestionTypeSchema,
  reasoningSkill: assessmentReasoningSkillSchema,
  acceptedStrategies: z.array(z.string()).default([]),
  hintLadder: z.array(z.string()).default([]),
  diagnosticTags: z.array(z.string()).default([]),
  evidenceRequirements: z.array(z.string()).default([]),
});

const assessmentEvaluationSchema = z.object({
  correct: z.boolean(),
  score: z.number().min(0).max(100),
  explanation: z.string(),
  reasoningScore: z.number().min(0).max(100),
  transferScore: z.number().min(0).max(100),
  originalityScore: z.number().min(0).max(100),
  nextDifficulty: quizDifficultySchema.default("medium"),
  reasoningStrength: z.string().default(""),
  misconception: z.string().nullable().default(null),
  thinkingPatternSignals: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        studentFacingSummary: z.string(),
        teacherSummary: z.string(),
      }),
    )
    .default([]),
});

const attemptPromptSchema = z.object({
  prompt: z.string(),
  whyThisMatters: z.string(),
});

const metacognitiveMirrorPromptSchema = z.object({
  mirror: z.string(),
  followUpQuestion: z.string(),
});

const sessionCloseSchema = z.object({
  affirmation: z.string(),
  honestGap: z.string(),
  homework: z.array(z.string()).min(1).max(3),
  summary: z.string(),
});

type TopicAccess = {
  topic: {
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    subjectKey?: string | null;
    contentLocale: string;
    learningOutcomes: LearningOutcomeDefinition[];
    sourceBoundary?: TopicSourceBoundary | null;
    classroom: {
      organizationId: string | null;
      gradeBand: string;
    };
  };
  classroomStudent: {
    id: string;
    fullName: string;
    interestProfile: {
      profile: StudentInterestProfile;
    } | null;
  };
};

type PreviousSessionContext = {
  sessionId: string | null;
  summary: string;
  homeworkAssigned: string[];
  identifiedGaps: string[];
  performanceByConcept: Array<{
    concept: string;
    score: number;
    status: "mastered" | "developing" | "needs_support";
  }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isoNow() {
  return new Date().toISOString();
}

function getCurrentPhase(state: LearningSessionState) {
  return state.phases.find((phase) => phase.id === state.currentPhaseId) ?? null;
}

function getNextPendingPhase(state: LearningSessionState) {
  return state.phases.find((phase) => phase.status === "pending") ?? null;
}

function markPhaseStatus(
  state: LearningSessionState,
  phaseId: number,
  status: LearningSessionPhase["status"],
) {
  state.phases = state.phases.map((phase) =>
    phase.id === phaseId
      ? {
          ...phase,
          status,
          startedAt:
            status === "in_progress" && !phase.startedAt ? isoNow() : phase.startedAt,
          completedAt:
            status === "completed" || status === "skipped" ? isoNow() : phase.completedAt,
        }
      : phase,
  );
}

function advanceToNextPendingPhase(state: LearningSessionState) {
  const next = getNextPendingPhase(state);
  state.currentPhaseId = next?.id ?? state.currentPhaseId;
  return next ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeQuestionMix(items: LearningAssessmentItem[]) {
  const retrievalCount = items.filter((item) => item.questionType === "retrieval_check").length;
  const hasExplanation = items.some((item) => item.questionType === "self_explanation");
  const hasTransfer = items.some((item) => item.questionType === "transfer_challenge");
  const hasMetacognition = items.some(
    (item) => item.questionType === "metacognitive_reflection",
  );

  return {
    retrievalCount,
    hasExplanation,
    hasTransfer,
    hasMetacognition,
  };
}

function chooseNextQuestionType(params: {
  subjectKey?: string | null;
  usedItems: LearningAssessmentItem[];
  forceMetacognition?: boolean;
}) {
  if (params.forceMetacognition) return "metacognitive_reflection" as const;

  const packageDefinition = getSubjectPackage(params.subjectKey);
  const sequence = getDefaultChallengeSequence(packageDefinition.key);
  const mix = computeQuestionMix(params.usedItems);

  if (!mix.hasExplanation) return "self_explanation" as const;
  if (!mix.hasTransfer) return "transfer_challenge" as const;

  const sequenceCandidate = sequence.find(
    (questionType) =>
      !params.usedItems.some((item) => item.questionType === questionType) &&
      !(questionType === "retrieval_check" && mix.retrievalCount >= 1),
  );
  if (sequenceCandidate) return sequenceCandidate;

  if (mix.retrievalCount === 0) return "retrieval_check" as const;
  return packageDefinition.challengeSequence.at(-1) ?? "compare_two_solutions";
}

function updateReasoningPatternSignals(
  state: LearningSessionState,
  signals: Array<{
    key: string;
    label: string;
    studentFacingSummary: string;
    teacherSummary: string;
  }>,
) {
  const now = isoNow();
  const next = [...state.thinkingPatternSignals];

  for (const signal of signals) {
    const existing = next.find((item) => item.key === signal.key);
    if (existing) {
      existing.evidenceCount += 1;
      existing.lastSeenAt = now;
      existing.studentFacingSummary = signal.studentFacingSummary;
      existing.teacherSummary = signal.teacherSummary;
      continue;
    }

    next.push(
      reasoningPatternSignalSchema.parse({
        key: signal.key,
        label: signal.label,
        evidenceCount: 1,
        lastSeenAt: now,
        studentFacingSummary: signal.studentFacingSummary,
        teacherSummary: signal.teacherSummary,
      }),
    );
  }

  state.thinkingPatternSignals = next
    .sort((left, right) => right.evidenceCount - left.evidenceCount)
    .slice(0, 8);
}

function recomputeReasoningScores(state: LearningSessionState) {
  const gradedItems = state.quizItems.filter((item) => item.score != null);
  if (gradedItems.length === 0) {
    return state;
  }

  state.reasoningQualityScore = Math.round(
    average(gradedItems.map((item) => item.reasoningScore ?? item.score ?? 0)),
  );
  state.transferPerformanceScore = Math.round(
    average(gradedItems.map((item) => item.transferScore ?? 0)),
  );
  state.originalityScore = Math.round(
    average(gradedItems.map((item) => item.originalityScore ?? 0)),
  );
  const uniqueStrategies = new Set(
    gradedItems.flatMap((item) =>
      item.acceptedStrategies
        .map((strategy) => strategy.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  state.strategyDiversityScore = Math.min(100, uniqueStrategies.size * 25);
  state.helpDependenceScore = Math.max(
    0,
    100 - Math.round(average(gradedItems.map((item) => item.helpUsed ?? 0)) * 18),
  );
  if (state.studentConfidenceScore != null) {
    const normalizedConfidence = state.studentConfidenceScore * 10;
    state.confidenceCalibrationScore = Math.max(
      0,
      100 - Math.abs(normalizedConfidence - (state.reasoningQualityScore ?? 0)),
    );
  }

  const habits = [
    state.thinkingPatternSignals.some((item) => item.key.includes("units"))
      ? "Needs to slow down and verify constraints or units."
      : null,
    state.thinkingPatternSignals.some((item) => item.key.includes("alternative"))
      ? "Benefits from being asked for a second valid strategy."
      : null,
    state.thinkingPatternSignals.some((item) => item.key.includes("justify"))
      ? "Needs to justify steps more explicitly."
      : null,
  ];
  state.metacognitiveHabits = uniqueStrings([
    ...state.metacognitiveHabits,
    ...habits,
  ]);

  return state;
}

function conceptDisplayName(state: LearningSessionState, conceptKey: string | null) {
  if (!conceptKey) return "this concept";
  return (
    state.conceptsToCover.find((concept) => concept.key === conceptKey)?.title ??
    conceptKey
  );
}

function ensureConceptState(state: LearningSessionState, conceptKey: string) {
  const concept = state.conceptsToCover.find((item) => item.key === conceptKey);
  if (!concept) {
    throw new Error(`Unknown session concept: ${conceptKey}`);
  }

  if (!state.conceptStates[conceptKey]) {
    state.conceptStates[conceptKey] = {
      conceptKey,
      conceptTitle: concept.title,
      attemptPrompt: "",
      attemptEvaluated: false,
      explanationAttempts: 0,
      comprehensionPassed: false,
      deepeningDone: false,
      studentExplanationGiven: false,
      currentStep: "attempt",
      masteryScore: null,
      confidence: null,
      gaps: [],
      notes: [],
      lastAnalogy: "",
      realWorldAnchor: "",
      reasoningScore: null,
      transferScore: null,
      originalityScore: null,
    };
  }

  return state.conceptStates[conceptKey]!;
}

function determineConceptsForSession(params: {
  topic: TopicAccess["topic"];
  previousReport?: TeacherProgressReport | null;
}) {
  const unmasteredPrevious =
    params.previousReport?.performanceByConcept
      .filter((item) => item.status !== "mastered")
      .map((item) => item.concept) ?? [];

  const prioritized = params.topic.learningOutcomes.filter((outcome) => {
    if (unmasteredPrevious.length === 0) return true;
    return unmasteredPrevious.some(
      (concept) =>
        concept.toLowerCase() === outcome.title.toLowerCase() ||
        concept.toLowerCase().includes(outcome.title.toLowerCase()) ||
        outcome.title.toLowerCase().includes(concept.toLowerCase()),
    );
  });

  const selected =
    (prioritized.length > 0 ? prioritized : params.topic.learningOutcomes).slice(0, 2);

  return selected.map((outcome) => ({
    key: slugify(outcome.id || outcome.title),
    title: outcome.title,
    outcomeIds: [outcome.id],
  }));
}

export function buildLearningSessionState(params: {
  topic: TopicAccess["topic"];
  previousSession?: PreviousSessionContext | null;
  previousReport?: TeacherProgressReport | null;
}) {
  const subjectPackage = getSubjectPackage(params.topic.subjectKey ?? params.topic.subject);
  const conceptsToCover = determineConceptsForSession({
    topic: params.topic,
    previousReport: params.previousReport,
  });

  const phases: LearningSessionPhase[] = [];
  let phaseId = 1;

  phases.push(
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "continuity_check",
      status: params.previousSession?.sessionId ? "pending" : "skipped",
    }),
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "opening_hook",
      status: "pending",
    }),
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "opening_probe",
      status: "pending",
    }),
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "connecting_question",
      status: "pending",
    }),
  );

  for (const concept of conceptsToCover) {
    phases.push(
      learningSessionPhaseSchema.parse({
        id: phaseId++,
        type: "attempt_first",
        status: "pending",
        conceptKey: concept.key,
      }),
      learningSessionPhaseSchema.parse({
        id: phaseId++,
        type: "concept_teaching",
        status: "pending",
        conceptKey: concept.key,
      }),
    );
  }

  phases.push(
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "assessment",
      status: "pending",
    }),
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "metacognitive_reflection",
      status: "pending",
    }),
    learningSessionPhaseSchema.parse({
      id: phaseId++,
      type: "session_close",
      status: "pending",
    }),
  );

  const firstPending = phases.find((phase) => phase.status === "pending") ?? phases[0]!;
  const conceptStates = Object.fromEntries(
    conceptsToCover.map((concept) => [
      concept.key,
      {
        conceptKey: concept.key,
        conceptTitle: concept.title,
        attemptPrompt: "",
        attemptEvaluated: false,
        explanationAttempts: 0,
        comprehensionPassed: false,
        deepeningDone: false,
        studentExplanationGiven: false,
        currentStep: "attempt" as const,
        masteryScore: null,
        confidence: null,
        gaps: [],
        notes: [],
        lastAnalogy: "",
        realWorldAnchor: "",
        reasoningScore: null,
        transferScore: null,
        originalityScore: null,
      },
    ]),
  );

  return learningSessionStateSchema.parse({
    topicTitle: params.topic.title,
    subjectPackageKey: subjectPackage.key,
    curriculumFrameworkKey:
      params.topic.learningOutcomes[0]?.curriculumFrameworkKey ?? "kmk_de_sek1",
    conceptsToCover,
    phases,
    currentPhaseId: firstPending.id,
    previousSessionId: params.previousSession?.sessionId ?? null,
    previousSessionSummary: params.previousSession?.summary ?? "",
    homeworkFromPreviousSession: params.previousSession?.homeworkAssigned ?? [],
    homeworkStatus: params.previousSession?.sessionId ? "not_done" : "not_applicable",
    gapsIdentified: params.previousSession?.identifiedGaps ?? [],
    completedConceptKeys: [],
    conceptStates,
    openingHook: "",
    openingProbe: "",
    openingProbeAssessment: null,
    connectingQuestion: "",
    quizItems: [],
    quizTargetCount: 4,
    quizCurrentIndex: 0,
    reflection: learningReflectionStateSchema.parse({}),
    reasoningQualityScore: null,
    strategyDiversityScore: null,
    transferPerformanceScore: null,
    helpDependenceScore: null,
    confidenceCalibrationScore: null,
    originalityScore: null,
    metacognitiveHabits: [],
    thinkingPatternSignals: [],
    metacognitiveMirror: metacognitiveMirrorStateSchema.parse({}),
    personalizedHomework: [],
    studentConfidenceScore: null,
    momentOfUnderstanding: null,
    learnerGoal: "",
    usedExampleLog: [],
    teachingPlaybook: null,
    reportReady: false,
  });
}

async function classifyQuestionIntent(params: {
  message: string;
  topicTitle: string;
  currentPhase: LearningSessionPhase;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const trimmed = params.message.trim();
  const looksLikeQuestion =
    trimmed.includes("?") ||
    /^(why|what|how|when|where|who|is|are|can|could|would|should|does|do)\b/i.test(
      trimmed,
    );

  if (!looksLikeQuestion) {
    return {
      intent: "phase_response" as QuestionIntent,
      reason: "No clear question signal detected.",
    };
  }

  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("intent-classification", "analysis"),
    output: Output.object({
      schema: questionIntentEnvelopeSchema,
    }),
    prompt: `Classify the student's message inside a structured tutoring session.

Topic: ${params.topicTitle}
Current phase: ${params.currentPhase.type}
Student message: ${params.message}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- clarification = they did not understand something just explained
- curiosity = they are extending the topic in a relevant way
- off_topic = unrelated to the session topic
- phase_response = they are mainly answering the active phase prompt`,
  }, buildTutoringObservedOptions(params.runtimeContext, "intent_classification", {
    topicTitle: params.topicTitle,
    phaseType: params.currentPhase.type,
  }));

  return output;
}

async function retrieveContext(params: {
  organizationId?: string | null;
  topicId: string;
  query: string;
  language?: string | null;
  aiRunId?: string;
}) {
  if (!params.organizationId) {
    return [];
  }

  const matches = await findLearningEvidenceContext({
    organizationId: params.organizationId,
    topicId: params.topicId,
    query: params.query,
    language: normalizeAppLocale(params.language ?? "en"),
    limit: 6,
  });

  if (params.aiRunId) {
    await recordAiStep({
      runId: params.aiRunId,
      stepKey: `rag-${slugify(params.query)}`,
      stepType: "rag_retrieval",
      payload: {
        topicId: params.topicId,
        query: params.query,
        matchCount: matches.length,
        sources: matches.slice(0, 4).map((item) => ({
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          score: item.score,
        })),
      },
      outputSummary: `${matches.length} learning material chunks retrieved`,
    }).catch(() => undefined);
  }

  return matches.map((item) => item.content).slice(0, 4);
}

async function generateOpeningProbe(params: {
  topicTitle: string;
  conceptTitle: string;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { text } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("opening-probe", "default"),
    prompt: `Write one low-stakes conversational probe question for the start of a tutoring session.

Topic: ${params.topicTitle}
Today's concept: ${params.conceptTitle}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- sound casual, not like a test
- ask what the student thinks right now
- let the playbook influence tone and framing when confidence is meaningful
- one short paragraph only
- no answer or explanation, just the question`,
  }, buildTutoringObservedOptions(params.runtimeContext, "opening_probe", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
  }));

  return text.trim();
}

async function generateConnectingQuestion(params: {
  conceptTitle: string;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { text } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("connecting-question", "default"),
    prompt: `Write one conversational question that connects the concept to the student's interests.

Concept: ${params.conceptTitle}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- make it specific to the student's world
- use the strongest interest domains from the playbook when confidence is high
- this is not a test question
- it should naturally make the student curious about the concept
- one short paragraph only`,
  }, buildTutoringObservedOptions(params.runtimeContext, "connecting_question", {
    conceptTitle: params.conceptTitle,
  }));

  return text.trim();
}

async function generateInterruptionReply(params: {
  intent: Exclude<QuestionIntent, "phase_response">;
  message: string;
  topicTitle: string;
  conceptTitle: string;
  gradeBand: GradeBand;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  retrievedContext: string[];
  runtimeContext?: TutoringRuntimeContext;
}) {
  if (params.intent !== "off_topic" && params.retrievedContext.length === 0) {
    return `I want to keep this grounded in the material your teacher gave me, and I don't have enough teacher-approved context to answer that safely yet. Let's stay with ${params.conceptTitle} for now, and I'll make sure this gap is visible on the teacher side.`;
  }

  const { text } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("interruption-reply", "default"),
    prompt: `You are responding to a student interruption during a structured tutoring session.

Intent: ${params.intent}
Topic: ${params.topicTitle}
Current concept: ${params.conceptTitle}
Grade band: ${params.gradeBand}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Retrieved teacher-approved context:
${renderRetrievedContext(params.retrievedContext)}

Student message:
${params.message}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- clarification: answer with a different explanation angle and then invite a one-sentence check-back
- curiosity: answer warmly, stay topic-adjacent, then return to the session
- off_topic: redirect warmly and briefly back to the lesson
- keep factual claims grounded in the retrieved context
- use the playbook to choose explanation style and encouragement tone when confidence is meaningful
- if the material does not support the answer, say so clearly`,
  }, buildTutoringObservedOptions(params.runtimeContext, "interruption_reply", {
    intent: params.intent,
    conceptTitle: params.conceptTitle,
  }));

  return text.trim();
}

async function generateConceptIntro(params: {
  topicTitle: string;
  conceptTitle: string;
  learningOutcomes: LearningOutcomeDefinition[];
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  retrievedContext: string[];
  runtimeContext?: TutoringRuntimeContext;
}) {
  if (params.retrievedContext.length === 0) {
    return {
      explanation: `I don't have enough teacher-approved material on ${params.conceptTitle} to explain it safely yet.`,
      analogy: "",
      technicalVocabulary:
        "I’m going to keep this narrow instead of guessing beyond the source material.",
      realWorldAnchor:
        "That gap will be visible to your teacher so they can add the right material.",
      comprehensionQuestion:
        "Tell me which part of this concept you most wanted help with, and I'll make sure that need is captured clearly.",
    };
  }

  const { output } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("concept-intro", "default"),
    output: Output.object({
      schema: conceptIntroSchema,
    }),
    prompt: `Teach the first part of a concept in a grounded, student-friendly way.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Relevant learning outcomes:
${params.learningOutcomes.map((outcome) => `- ${outcome.title}: ${outcome.description}`).join("\n")}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}
Retrieved teacher-approved context:
${renderRetrievedContext(params.retrievedContext)}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- plain language first
- personalized analogy second
- technical vocabulary only after the idea is clear
- include one real-world anchor sentence
- end with one comprehension check question
- prefer the explanation approaches and interest domains in the playbook when confidence is meaningful
- avoid repeating usedExampleReferences from the playbook
- all factual claims must come from the retrieved context
- if the context is too weak, be honest and keep the explanation narrow`,
  }, buildTutoringObservedOptions(params.runtimeContext, "concept_intro", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
    outcomeCount: params.learningOutcomes.length,
  }));

  return output;
}

async function evaluateOpeningProbe(params: {
  topicTitle: string;
  conceptTitle: string;
  studentMessage: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("opening-probe-eval", "analysis"),
    output: Output.object({
      schema: probeEvaluationSchema,
    }),
    prompt: `Assess the student's low-stakes opening probe response.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Student response: ${params.studentMessage}

Return:
- strength = strong, partial, or weak
- feedback = warm response to the student
- gap = the missing idea if any`,
  }, buildTutoringObservedOptions(params.runtimeContext, "opening_probe_evaluation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
  }));

  return output;
}

async function evaluateHomeworkResponse(params: {
  topicTitle: string;
  previousSummary: string;
  homework: string[];
  studentMessage: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("continuity-check-eval", "analysis"),
    output: Output.object({
      schema: continuityEvaluationSchema,
    }),
    prompt: `Assess a student's response to a homework follow-up at the start of a new tutoring session.

Topic: ${params.topicTitle}
Previous session summary: ${params.previousSummary}
Homework assigned:
${params.homework.map((item) => `- ${item}`).join("\n") || "none"}
Student response:
${params.studentMessage}

Return:
- homeworkStatus using the provided enum
- feedback to send directly to the student
- gap if the response shows unresolved confusion`,
  }, buildTutoringObservedOptions(params.runtimeContext, "continuity_evaluation", {
    topicTitle: params.topicTitle,
    homeworkCount: params.homework.length,
  }));

  return output;
}

async function evaluateConceptComprehension(params: {
  topicTitle: string;
  conceptTitle: string;
  studentMessage: string;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  retrievedContext: string[];
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("concept-comprehension-eval", "analysis"),
    output: Output.object({
      schema: conceptComprehensionSchema,
    }),
    prompt: `Evaluate whether the student has understood the concept and produce the next teaching move.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}
Retrieved teacher-approved context:
${renderRetrievedContext(params.retrievedContext)}
Student answer:
${params.studentMessage}

Rules:
- passed should be true only if the student has a usable understanding in their own words
- if not passed, alternativeExplanation must use a genuinely different angle
- nextQuestion should be a comprehension check when not passed, or a deepening question when passed
- use the playbook to choose the next explanation route when confidence is meaningful
- keep all factual claims inside the retrieved context`,
  }, buildTutoringObservedOptions(params.runtimeContext, "concept_comprehension_evaluation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
  }));

  return output;
}

async function evaluateDeepening(params: {
  topicTitle: string;
  conceptTitle: string;
  nextConceptTitle: string | null;
  studentMessage: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("deepening-eval", "analysis"),
    output: Output.object({
      schema: deepeningEvaluationSchema,
    }),
    prompt: `Evaluate a student's response to a deepening question in a tutoring session.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Next concept: ${params.nextConceptTitle ?? "none"}
Student response:
${params.studentMessage}

Rules:
- readyToAdvance can be true even if the answer is not perfect, as long as the student is ready to move on
- feedback should affirm what they managed and gently clean up anything important
- bridge should link naturally to the next concept, or to the quiz if there is no next concept`,
  }, buildTutoringObservedOptions(params.runtimeContext, "deepening_evaluation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
    nextConceptTitle: params.nextConceptTitle,
  }));

  return output;
}

async function generateAttemptPrompt(params: {
  topicTitle: string;
  conceptTitle: string;
  subjectKey?: string | null;
  learningOutcomes: LearningOutcomeDefinition[];
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const subjectPackage = getSubjectPackage(params.subjectKey);
  const { output } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("attempt-first", "default"),
    output: Output.object({
      schema: attemptPromptSchema,
    }),
    prompt: `Write an attempt-first prompt before teaching a concept.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Subject package: ${subjectPackage.label}
Learning outcomes:
${params.learningOutcomes.map((outcome) => `- ${outcome.title}: ${outcome.description}`).join("\n")}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- ask the student to attempt, predict, or explain before you teach
- prefer explanation or strategy over final answer only
- keep it emotionally safe and low-stakes
- one question only
- whyThisMatters should be one concise coaching sentence`,
  }, buildTutoringObservedOptions(params.runtimeContext, "attempt_first_generation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
  }));

  return output;
}

async function generateAssessmentQuestion(params: {
  topicTitle: string;
  conceptTitle: string;
  subjectKey?: string | null;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  gradeBand: GradeBand;
  difficulty: "easy" | "medium" | "hard";
  questionType: AssessmentQuestionType;
  retrievedContext: string[];
  runtimeContext?: TutoringRuntimeContext;
}) {
  const subjectPackage = getSubjectPackage(params.subjectKey);
  const { output } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("assessment-question", "default"),
    output: Output.object({
      schema: assessmentQuestionSchema,
    }),
    prompt: `Generate one reasoning-first assessment item for a tutoring session.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Subject package: ${subjectPackage.label}
Question type: ${params.questionType}
Accepted competencies: ${subjectPackage.competencyModel.join(", ")}
Teacher guidance:
${subjectPackage.teacherGuidance.map((item) => `- ${item}`).join("\n")}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Grade band: ${params.gradeBand}
Difficulty: ${params.difficulty}
Retrieved teacher-approved context:
${renderRetrievedContext(params.retrievedContext)}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- personalize the framing to the student's interests where possible
- prefer high-resonance domains from the playbook and avoid reusing old example references
- require reasoning, not simple recall
- multiple valid approaches are allowed when the subject permits them
- acceptedStrategies should name valid approaches, not just the expected answer
- hintLadder should move from nudge to stronger scaffold without giving away the full solution
- diagnosticTags should capture likely misconception patterns
- evidenceRequirements should say what a good answer must show
- expectedAnswer should be concise
- explanation should explain the answer clearly
- the question must stay within the retrieved context`,
  }, buildTutoringObservedOptions(params.runtimeContext, "assessment_question_generation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
    difficulty: params.difficulty,
    questionType: params.questionType,
  }));

  return output;
}

export async function previewAssessmentQuestionForTopic(params: {
  topic: TopicAccess["topic"];
  conceptTitle?: string | null;
  questionType?: AssessmentQuestionType;
  difficulty?: "easy" | "medium" | "hard";
  studentProfile?: StudentInterestProfile | null;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const subjectKey = params.topic.subjectKey ?? params.topic.subject;
  const conceptTitle =
    params.conceptTitle?.trim() ||
    params.topic.learningOutcomes[0]?.title ||
    params.topic.title;
  const questionType =
    params.questionType ??
    chooseNextQuestionType({
      subjectKey,
      usedItems: [],
    });
  const studentProfile =
    params.studentProfile ??
    ({
      primaryInterests: [
        {
          label: "problem solving",
          details: "Enjoys working through challenging school problems step by step.",
        },
      ],
      aspirations: [],
      curiosityAreas: [params.topic.subject ?? params.topic.title],
      motivationalStyle: ["personal_mastery"],
      learningRelationship: "neutral",
      contextTags: [],
      privateNotes: [],
      lastUpdated: isoNow(),
    } satisfies StudentInterestProfile);
  const retrievedContext = await retrieveContext({
    organizationId: params.topic.classroom.organizationId,
    topicId: params.topic.id,
    query: `${params.topic.title} ${conceptTitle}`,
    language: params.topic.contentLocale,
    aiRunId: params.runtimeContext?.aiRunId,
  });

  return await generateAssessmentQuestion({
    topicTitle: params.topic.title,
    conceptTitle,
    subjectKey,
    studentProfile,
    teachingPlaybook: params.teachingPlaybook,
    gradeBand: params.topic.classroom.gradeBand as GradeBand,
    difficulty: params.difficulty ?? "medium",
    questionType,
    retrievedContext,
    runtimeContext: params.runtimeContext,
  });
}

async function evaluateAssessmentAnswer(params: {
  topicTitle: string;
  conceptTitle: string;
  questionType: AssessmentQuestionType;
  subjectKey?: string | null;
  prompt: string;
  expectedAnswer: string;
  explanation: string;
  acceptedStrategies: string[];
  evidenceRequirements: string[];
  diagnosticTags: string[];
  difficulty: "easy" | "medium" | "hard";
  studentAnswer: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const subjectPackage = getSubjectPackage(params.subjectKey);
  const { output } = await generateObservedText({
    model: analysisModel,
    system: TUTORING_ANALYSIS_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("assessment-answer-eval", "analysis"),
    output: Output.object({
      schema: assessmentEvaluationSchema,
    }),
    prompt: `Evaluate the student's answer to a reasoning-first tutoring assessment item.

Topic: ${params.topicTitle}
Concept: ${params.conceptTitle}
Subject package: ${subjectPackage.label}
Question type: ${params.questionType}
Difficulty: ${params.difficulty}
Question: ${params.prompt}
Expected answer: ${params.expectedAnswer}
Reference explanation: ${params.explanation}
Accepted strategies:
${params.acceptedStrategies.map((item) => `- ${item}`).join("\n") || "- none provided"}
Evidence requirements:
${params.evidenceRequirements.map((item) => `- ${item}`).join("\n") || "- none provided"}
Diagnostic tags:
${params.diagnosticTags.map((item) => `- ${item}`).join("\n") || "- none provided"}
Student answer: ${params.studentAnswer}

Return:
- correct
- score
- explanation to say to the student
- reasoningScore
- transferScore
- originalityScore
- reasoningStrength
- misconception if visible
- thinkingPatternSignals only when the answer shows a reusable reasoning habit
- nextDifficulty based on adaptive progression`,
  }, buildTutoringObservedOptions(params.runtimeContext, "assessment_answer_evaluation", {
    topicTitle: params.topicTitle,
    conceptTitle: params.conceptTitle,
    difficulty: params.difficulty,
    questionType: params.questionType,
  }));

  return output;
}

async function generateMetacognitiveMirrorPrompt(params: {
  topicTitle: string;
  state: LearningSessionState;
  studentProfile: StudentInterestProfile;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const signal = params.state.thinkingPatternSignals.find((item) => item.evidenceCount >= 2);
  if (!signal) {
    return {
      mirror:
        "You stayed with some genuinely hard thinking today. Before we finish, tell me one move that helped you understand more deeply.",
      followUpQuestion:
        "What would you like to remember next time when a problem feels confusing at first?",
    };
  }

  const { output } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("metacognitive-mirror", "default"),
    output: Output.object({
      schema: metacognitiveMirrorPromptSchema,
    }),
    prompt: `Write a metacognitive mirror for a student at the end of a tutoring session.

Topic: ${params.topicTitle}
Signal label: ${signal.label}
Student-facing summary: ${signal.studentFacingSummary}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Session snapshot:
${renderLearningStateSnapshot(params.state)}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- mirror a repeated reasoning habit, not a one-off mistake
- be specific, calm, and non-judgmental
- invite the student to reflect on how they will handle it next time`,
  }, buildTutoringObservedOptions(params.runtimeContext, "metacognitive_mirror_generation", {
    topicTitle: params.topicTitle,
    signalKey: signal.key,
  }));

  return output;
}

async function generateSessionClose(params: {
  topicTitle: string;
  state: LearningSessionState;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const { output } = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("session-close", "default"),
    output: Output.object({
      schema: sessionCloseSchema,
    }),
    prompt: `Write the close of a tutoring session.

Topic: ${params.topicTitle}
Session snapshot:
${renderLearningStateSnapshot(params.state)}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- affirmation must be specific to demonstrated understanding
- honestGap must be non-judgmental and precise
- homework must target the remaining gap and be low-pressure
- let the playbook influence encouragement style without sounding formulaic
- summary should briefly describe the session outcome for internal storage`,
  }, buildTutoringObservedOptions(params.runtimeContext, "session_close_generation", {
    topicTitle: params.topicTitle,
    conceptCount: params.state.conceptsToCover.length,
    gapCount: params.state.gapsIdentified.length,
  }));

  return output;
}

function parseConfidenceScore(message: string) {
  const match = message.match(/\b(10|[1-9])\b/);
  if (!match) return null;
  const score = Number(match[1]);
  return score >= 1 && score <= 10 ? score : null;
}

async function autoAdvanceUntilPause(params: {
  state: LearningSessionState;
  access: TopicAccess;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const state = learningSessionStateSchema.parse(params.state);
  const replies: string[] = [];
  let waitingForStudent = false;

  while (!waitingForStudent) {
    const phase = getCurrentPhase(state);
    if (!phase) break;

    if (phase.status === "completed" || phase.status === "skipped") {
      const next = advanceToNextPendingPhase(state);
      if (!next) break;
      continue;
    }

    if (phase.type === "continuity_check") {
      if (!state.previousSessionId) {
        markPhaseStatus(state, phase.id, "skipped");
        const next = advanceToNextPendingPhase(state);
        if (!next) break;
        continue;
      }

      markPhaseStatus(state, phase.id, "in_progress");
      replies.push(
        `Last time we worked on ${uniqueStrings(
          state.conceptsToCover.map((concept) => concept.title),
        ).join(" and ")}. ${state.homeworkFromPreviousSession.length > 0 ? `I asked you to think about ${state.homeworkFromPreviousSession.join(" ; ")}. ` : ""}What did you come up with?`,
      );
      waitingForStudent = true;
      continue;
    }

    if (phase.type === "opening_hook") {
      markPhaseStatus(state, phase.id, "in_progress");
      const opening = await generateSessionOpening({
        topicTitle: params.access.topic.title,
        topicDescription: params.access.topic.description,
        subject: params.access.topic.subject,
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        learningOutcomes: params.access.topic.learningOutcomes,
        boundary: params.access.topic.sourceBoundary ?? null,
        runtimeContext: params.runtimeContext,
      });
      state.openingHook = opening.opening;
      state.usedExampleLog = uniqueStrings([
        ...state.usedExampleLog,
        opening.opening,
      ]);
      replies.push(opening.opening);
      markPhaseStatus(state, phase.id, "completed");
      const next = advanceToNextPendingPhase(state);
      if (!next) break;
      continue;
    }

    if (phase.type === "opening_probe") {
      markPhaseStatus(state, phase.id, "in_progress");
      const firstConcept = state.conceptsToCover[0];
      const probe = await generateOpeningProbe({
        topicTitle: params.access.topic.title,
        conceptTitle: firstConcept?.title ?? params.access.topic.title,
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
        runtimeContext: params.runtimeContext,
      });
      state.openingProbe = probe;
      replies.push(probe);
      waitingForStudent = true;
      continue;
    }

    if (phase.type === "connecting_question") {
      markPhaseStatus(state, phase.id, "in_progress");
      const firstConcept = state.conceptsToCover[0];
      const connectingQuestion = await generateConnectingQuestion({
        conceptTitle: firstConcept?.title ?? params.access.topic.title,
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
        runtimeContext: params.runtimeContext,
      });
      state.connectingQuestion = connectingQuestion;
      replies.push(connectingQuestion);
      waitingForStudent = true;
      continue;
    }

    if (phase.type === "attempt_first") {
      markPhaseStatus(state, phase.id, "in_progress");
      const conceptKey = phase.conceptKey;
      if (!conceptKey) {
        markPhaseStatus(state, phase.id, "skipped");
        const next = advanceToNextPendingPhase(state);
        if (!next) break;
        continue;
      }

      const conceptState = ensureConceptState(state, conceptKey);
      const conceptTitle = conceptDisplayName(state, conceptKey);
      const attempt = await generateAttemptPrompt({
        topicTitle: params.access.topic.title,
        conceptTitle,
        subjectKey: state.subjectPackageKey,
        learningOutcomes: params.access.topic.learningOutcomes.filter((outcome) =>
          state.conceptsToCover
            .find((concept) => concept.key === conceptKey)
            ?.outcomeIds.includes(outcome.id),
        ),
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
        runtimeContext: params.runtimeContext,
      });
      conceptState.attemptPrompt = attempt.prompt;
      replies.push(`${attempt.whyThisMatters}\n\n${attempt.prompt}`);
      waitingForStudent = true;
      continue;
    }

    if (phase.type === "concept_teaching") {
      markPhaseStatus(state, phase.id, "in_progress");
      const conceptKey = phase.conceptKey;
      if (!conceptKey) {
        markPhaseStatus(state, phase.id, "skipped");
        const next = advanceToNextPendingPhase(state);
        if (!next) break;
        continue;
      }

      const conceptState = ensureConceptState(state, conceptKey);
      const conceptTitle = conceptDisplayName(state, conceptKey);

      if (conceptState.currentStep === "attempt") {
        conceptState.currentStep = "intro";
      }

      if (conceptState.currentStep === "intro") {
        const retrievedContext = await retrieveContext({
          organizationId: params.access.topic.classroom.organizationId,
          topicId: params.access.topic.id,
          query: `${params.access.topic.title} ${conceptTitle}`,
          language: params.access.topic.contentLocale,
          aiRunId: params.runtimeContext?.aiRunId,
        });

        const intro = await generateConceptIntro({
          topicTitle: params.access.topic.title,
          conceptTitle,
          learningOutcomes: params.access.topic.learningOutcomes.filter((outcome) =>
            state.conceptsToCover
              .find((concept) => concept.key === conceptKey)
              ?.outcomeIds.includes(outcome.id),
          ),
          studentProfile: params.access.classroomStudent.interestProfile!.profile,
          teachingPlaybook: state.teachingPlaybook,
          gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
          retrievedContext,
          runtimeContext: params.runtimeContext,
        });

        conceptState.explanationAttempts += 1;
        conceptState.currentStep = "awaiting_comprehension";
        conceptState.lastAnalogy = intro.analogy;
        conceptState.realWorldAnchor = intro.realWorldAnchor;
        state.usedExampleLog = uniqueStrings([
          ...state.usedExampleLog,
          intro.analogy,
          intro.realWorldAnchor,
        ]);
        replies.push(
          `${intro.explanation}\n\n${intro.analogy}\n\n${intro.technicalVocabulary}\n\n${intro.realWorldAnchor}\n\n${intro.comprehensionQuestion}`,
        );
        waitingForStudent = true;
        continue;
      }

      waitingForStudent = true;
      continue;
    }

    if (phase.type === "assessment" || phase.type === "quiz") {
      markPhaseStatus(state, phase.id, "in_progress");
      if (state.quizCurrentIndex >= state.quizTargetCount) {
        markPhaseStatus(state, phase.id, "completed");
        const next = advanceToNextPendingPhase(state);
        if (!next) break;
        continue;
      }

      const nextConcept =
        state.conceptsToCover[
          Math.min(state.quizCurrentIndex, state.conceptsToCover.length - 1)
        ] ?? state.conceptsToCover[0];
      const previousItem = state.quizItems[state.quizItems.length - 1];
      const desiredDifficulty =
        previousItem?.correct == null
          ? "medium"
          : previousItem.correct
            ? previousItem.difficulty === "hard"
              ? "hard"
              : previousItem.difficulty === "medium"
                ? "hard"
                : "medium"
            : previousItem.difficulty === "hard"
              ? "medium"
              : "easy";

      const retrievedContext = await retrieveContext({
        organizationId: params.access.topic.classroom.organizationId,
        topicId: params.access.topic.id,
        query: `${params.access.topic.title} ${nextConcept?.title ?? ""}`,
        language: params.access.topic.contentLocale,
        aiRunId: params.runtimeContext?.aiRunId,
      });

      const questionType = chooseNextQuestionType({
        subjectKey: state.subjectPackageKey,
        usedItems: state.quizItems,
      });
      const question = await generateAssessmentQuestion({
        topicTitle: params.access.topic.title,
        conceptTitle: nextConcept?.title ?? params.access.topic.title,
        subjectKey: state.subjectPackageKey,
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
        difficulty: desiredDifficulty,
        questionType,
        retrievedContext,
        runtimeContext: params.runtimeContext,
      });

      const item = learningAssessmentItemSchema.parse({
        id: `${phase.id}-${state.quizItems.length + 1}`,
        conceptKey: nextConcept?.key ?? "general",
        prompt: question.prompt,
        questionType: question.questionType,
        primaryCompetency:
          getSubjectPackage(state.subjectPackageKey).competencyModel[0] ??
          "conceptual_understanding",
        reasoningSkill: question.reasoningSkill,
        transferLevel:
          question.questionType === "transfer_challenge" ? "far" : "near",
        originalityMode:
          state.subjectPackageKey === "mathematics"
            ? "multiple_valid_strategies"
            : "constrained_originality",
        acceptedStrategies: question.acceptedStrategies,
        hintLadder: question.hintLadder,
        diagnosticTags: question.diagnosticTags,
        evidenceRequirements: question.evidenceRequirements,
        expectedAnswer: question.expectedAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty,
      });

      state.quizItems.push(item);
      replies.push(
        state.quizItems.length === 1
          ? `Let's try something. These aren't tests, I just want to see how your brain is making sense of this.\n\n${question.prompt}`
          : question.prompt,
      );
      waitingForStudent = true;
      continue;
    }

    if (phase.type === "metacognitive_reflection" || phase.type === "self_reflection") {
      markPhaseStatus(state, phase.id, "in_progress");
      if (phase.type === "metacognitive_reflection") {
        state.metacognitiveMirror.highlightedPatternKey =
          state.thinkingPatternSignals.find((item) => item.evidenceCount >= 2)?.key ?? null;
        const mirror = await generateMetacognitiveMirrorPrompt({
          topicTitle: params.access.topic.title,
          state,
          studentProfile: params.access.classroomStudent.interestProfile!.profile,
          runtimeContext: params.runtimeContext,
        });
        if (state.metacognitiveMirror.currentStep === "awaiting_pattern_reflection") {
          replies.push(`${mirror.mirror}\n\n${mirror.followUpQuestion}`);
          waitingForStudent = true;
          continue;
        }

        if (state.metacognitiveMirror.currentStep === "awaiting_strategy_commitment") {
          replies.push(
            "What is one concrete thing you want to do next time so your thinking stays stronger when the problem gets hard?",
          );
          waitingForStudent = true;
          continue;
        }

        if (state.metacognitiveMirror.currentStep === "awaiting_confidence") {
          replies.push(
            "On a scale from 1 to 10, how confident do you feel now that you could reason through a similar problem on your own?",
          );
          waitingForStudent = true;
          continue;
        }

        if (state.metacognitiveMirror.currentStep === "awaiting_click_moment") {
          replies.push(
            "Was there a moment where something clicked more deeply for you today? What changed in your thinking right before that happened?",
          );
          waitingForStudent = true;
          continue;
        }
      } else {
        if (state.reflection.currentStep === "awaiting_confidence") {
          replies.push(
            "On a scale of 1 to 10, how confident do you feel about what we covered today?",
          );
          waitingForStudent = true;
          continue;
        }

        if (state.reflection.currentStep === "awaiting_click_moment") {
          replies.push(
            "Was there a moment in this session where something clicked and suddenly made sense? What was happening right before that moment?",
          );
          waitingForStudent = true;
          continue;
        }
      }
    }

    if (phase.type === "session_close") {
      markPhaseStatus(state, phase.id, "in_progress");
      const close = await generateSessionClose({
        topicTitle: params.access.topic.title,
        state,
        studentProfile: params.access.classroomStudent.interestProfile!.profile,
        teachingPlaybook: state.teachingPlaybook,
        runtimeContext: params.runtimeContext,
      });
      state.personalizedHomework = close.homework;
      state.reportReady = true;
      replies.push(
        `${close.affirmation}\n\n${close.honestGap}\n\nBefore next time, think through these:\n${close.homework.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n")}`,
      );
      markPhaseStatus(state, phase.id, "completed");
      break;
    }
  }

  return {
    state: learningSessionStateSchema.parse(state),
    response: replies.join("\n\n"),
  };
}

export async function runTutoringSessionTurn(params: {
  state: LearningSessionState;
  access: TopicAccess;
  userMessage?: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const state = learningSessionStateSchema.parse(params.state);
  const currentPhase = getCurrentPhase(state);

  if (!params.userMessage?.trim()) {
    const auto = await autoAdvanceUntilPause({
      state,
      access: params.access,
      runtimeContext: params.runtimeContext,
    });

    return {
      state: auto.state,
      response: auto.response,
      userIntent: null as QuestionIntent | null,
      completed: auto.state.reportReady,
    };
  }

  if (!currentPhase) {
    return {
      state,
      response: "",
      userIntent: "phase_response" as QuestionIntent,
      completed: state.reportReady,
    };
  }

  const intentEnvelope = await classifyQuestionIntent({
    message: params.userMessage,
    topicTitle: params.access.topic.title,
    currentPhase,
    runtimeContext: params.runtimeContext,
  });

  if (intentEnvelope.intent !== "phase_response") {
    const activeConceptTitle =
      currentPhase.conceptKey != null
        ? conceptDisplayName(state, currentPhase.conceptKey)
        : state.conceptsToCover[0]?.title ?? params.access.topic.title;
    const retrievedContext = await retrieveContext({
      organizationId: params.access.topic.classroom.organizationId,
      topicId: params.access.topic.id,
      query: `${params.access.topic.title} ${activeConceptTitle} ${params.userMessage}`,
      language: params.access.topic.contentLocale,
      aiRunId: params.runtimeContext?.aiRunId,
    });

    const response = await generateInterruptionReply({
      intent: intentEnvelope.intent,
      message: params.userMessage,
      topicTitle: params.access.topic.title,
      conceptTitle: activeConceptTitle,
      gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
      studentProfile: params.access.classroomStudent.interestProfile!.profile,
      teachingPlaybook: state.teachingPlaybook,
      retrievedContext,
      runtimeContext: params.runtimeContext,
    });

    return {
      state,
      response,
      userIntent: intentEnvelope.intent,
      completed: state.reportReady,
    };
  }

  const replies: string[] = [];

  if (currentPhase.type === "continuity_check") {
    const evaluation = await evaluateHomeworkResponse({
      topicTitle: params.access.topic.title,
      previousSummary: state.previousSessionSummary,
      homework: state.homeworkFromPreviousSession,
      studentMessage: params.userMessage,
      runtimeContext: params.runtimeContext,
    });

    state.homeworkStatus = evaluation.homeworkStatus;
    if (evaluation.gap) {
      state.gapsIdentified = uniqueStrings([...state.gapsIdentified, evaluation.gap]);
    }
    replies.push(evaluation.feedback);
    markPhaseStatus(state, currentPhase.id, "completed");
    advanceToNextPendingPhase(state);
  } else if (currentPhase.type === "opening_probe") {
    const evaluation = await evaluateOpeningProbe({
      topicTitle: params.access.topic.title,
      conceptTitle: state.conceptsToCover[0]?.title ?? params.access.topic.title,
      studentMessage: params.userMessage,
      runtimeContext: params.runtimeContext,
    });
    state.openingProbeAssessment = evaluation.strength;
    if (evaluation.gap) {
      state.gapsIdentified = uniqueStrings([...state.gapsIdentified, evaluation.gap]);
    }
    replies.push(evaluation.feedback);
    markPhaseStatus(state, currentPhase.id, "completed");
    advanceToNextPendingPhase(state);
  } else if (currentPhase.type === "connecting_question") {
    replies.push("Nice. Keep that picture in your head while we work through this.");
    markPhaseStatus(state, currentPhase.id, "completed");
    advanceToNextPendingPhase(state);
  } else if (currentPhase.type === "attempt_first") {
    const conceptKey = currentPhase.conceptKey;
    if (!conceptKey) {
      markPhaseStatus(state, currentPhase.id, "skipped");
      advanceToNextPendingPhase(state);
    } else {
      const conceptState = ensureConceptState(state, conceptKey);
      conceptState.attemptEvaluated = true;
      conceptState.notes = uniqueStrings([
        ...conceptState.notes,
        `Initial attempt: ${params.userMessage.trim()}`,
      ]);
      if (params.userMessage.trim().length < 20) {
        state.gapsIdentified = uniqueStrings([
          ...state.gapsIdentified,
          `${conceptState.conceptTitle}: initial attempt was too brief to reveal reasoning`,
        ]);
      }
      replies.push(
        "Good. I wanted to see your first instinct before I explained anything. Let's build from what you just showed me.",
      );
      markPhaseStatus(state, currentPhase.id, "completed");
      advanceToNextPendingPhase(state);
    }
  } else if (currentPhase.type === "concept_teaching") {
    const conceptKey = currentPhase.conceptKey;
    if (!conceptKey) {
      markPhaseStatus(state, currentPhase.id, "skipped");
      advanceToNextPendingPhase(state);
    } else {
      const conceptState = ensureConceptState(state, conceptKey);
      const conceptTitle = conceptDisplayName(state, conceptKey);
      const retrievedContext = await retrieveContext({
        organizationId: params.access.topic.classroom.organizationId,
        topicId: params.access.topic.id,
        query: `${params.access.topic.title} ${conceptTitle} ${params.userMessage}`,
        language: params.access.topic.contentLocale,
        aiRunId: params.runtimeContext?.aiRunId,
      });

      if (conceptState.currentStep === "awaiting_comprehension") {
        const evaluation = await evaluateConceptComprehension({
          topicTitle: params.access.topic.title,
          conceptTitle,
          studentMessage: params.userMessage,
          studentProfile: params.access.classroomStudent.interestProfile!.profile,
          teachingPlaybook: state.teachingPlaybook,
          gradeBand: params.access.topic.classroom.gradeBand as GradeBand,
          retrievedContext,
          runtimeContext: params.runtimeContext,
        });

        conceptState.masteryScore = evaluation.score;
        conceptState.confidence = evaluation.confidence;
        conceptState.studentExplanationGiven = true;

        if (evaluation.gap) {
          conceptState.gaps = uniqueStrings([...conceptState.gaps, evaluation.gap]);
          state.gapsIdentified = uniqueStrings([...state.gapsIdentified, evaluation.gap]);
        }

        if (evaluation.passed) {
          conceptState.comprehensionPassed = true;
          conceptState.currentStep = "awaiting_deepening";
          conceptState.reasoningScore = evaluation.score;
          replies.push(`${evaluation.feedback}\n\n${evaluation.nextQuestion}`);
        } else {
          conceptState.explanationAttempts += 1;
          conceptState.currentStep = "awaiting_comprehension";
          conceptState.lastAnalogy = evaluation.alternativeAnalogy || conceptState.lastAnalogy;
          state.usedExampleLog = uniqueStrings([
            ...state.usedExampleLog,
            evaluation.alternativeAnalogy,
          ]);
          replies.push(
            `${evaluation.feedback}\n\n${evaluation.alternativeExplanation}\n\n${evaluation.alternativeAnalogy}\n\n${evaluation.nextQuestion}`,
          );
        }
      } else if (conceptState.currentStep === "awaiting_deepening") {
        const nextConcept = state.conceptsToCover.find(
          (concept) =>
            concept.key !== conceptKey &&
            !state.completedConceptKeys.includes(concept.key),
        );
        const evaluation = await evaluateDeepening({
          topicTitle: params.access.topic.title,
          conceptTitle,
          nextConceptTitle: nextConcept?.title ?? null,
          studentMessage: params.userMessage,
          runtimeContext: params.runtimeContext,
        });

        conceptState.deepeningDone = true;
        conceptState.currentStep = "bridge";
        conceptState.transferScore = evaluation.readyToAdvance ? 75 : 45;
        state.completedConceptKeys = uniqueStrings([
          ...state.completedConceptKeys,
          conceptKey,
        ]);
        replies.push(`${evaluation.feedback}\n\n${evaluation.bridge}`);
        markPhaseStatus(state, currentPhase.id, "completed");
        advanceToNextPendingPhase(state);
      }
    }
  } else if (currentPhase.type === "assessment" || currentPhase.type === "quiz") {
    const currentQuestion = state.quizItems[state.quizItems.length - 1];
    if (!currentQuestion || currentQuestion.studentAnswer !== null) {
      const auto = await autoAdvanceUntilPause({
        state,
        access: params.access,
        runtimeContext: params.runtimeContext,
      });

      return {
        state: auto.state,
        response: auto.response,
        userIntent: intentEnvelope.intent,
        completed: auto.state.reportReady,
      };
    }

    const conceptTitle =
      state.conceptsToCover.find((concept) => concept.key === currentQuestion.conceptKey)
        ?.title ?? currentQuestion.conceptKey;
    const evaluation = await evaluateAssessmentAnswer({
      topicTitle: params.access.topic.title,
      conceptTitle,
      questionType: currentQuestion.questionType,
      subjectKey: state.subjectPackageKey,
      prompt: currentQuestion.prompt,
      expectedAnswer: currentQuestion.expectedAnswer,
      explanation: currentQuestion.explanation,
      acceptedStrategies: currentQuestion.acceptedStrategies,
      evidenceRequirements: currentQuestion.evidenceRequirements,
      diagnosticTags: currentQuestion.diagnosticTags,
      difficulty: currentQuestion.difficulty,
      studentAnswer: params.userMessage,
      runtimeContext: params.runtimeContext,
    });

    currentQuestion.studentAnswer = params.userMessage;
    currentQuestion.correct = evaluation.correct;
    currentQuestion.score = evaluation.score;
    currentQuestion.reasoningScore = evaluation.reasoningScore;
    currentQuestion.transferScore = evaluation.transferScore;
    currentQuestion.originalityScore = evaluation.originalityScore;
    currentQuestion.explanation = evaluation.explanation;
    currentQuestion.rubric = [
      {
        dimension: "reasoning",
        score: evaluation.reasoningScore,
        note: evaluation.reasoningStrength,
      },
      {
        dimension: "transfer",
        score: evaluation.transferScore,
        note:
          currentQuestion.questionType === "transfer_challenge"
            ? "Transfer performance on harder application."
            : "",
      },
      {
        dimension: "originality",
        score: evaluation.originalityScore,
        note: "Validity and independence of approach.",
      },
    ];
    if (evaluation.misconception) {
      state.gapsIdentified = uniqueStrings([
        ...state.gapsIdentified,
        evaluation.misconception,
      ]);
    }
    updateReasoningPatternSignals(state, evaluation.thinkingPatternSignals);
    recomputeReasoningScores(state);
    state.quizCurrentIndex += 1;
    replies.push(evaluation.explanation);

    if (state.quizCurrentIndex >= state.quizTargetCount) {
      markPhaseStatus(state, currentPhase.id, "completed");
      advanceToNextPendingPhase(state);
    }
  } else if (currentPhase.type === "metacognitive_reflection") {
    if (state.metacognitiveMirror.currentStep === "awaiting_pattern_reflection") {
      state.metacognitiveMirror.patternReflection = params.userMessage.trim();
      state.metacognitiveMirror.currentStep = "awaiting_strategy_commitment";
    } else if (state.metacognitiveMirror.currentStep === "awaiting_strategy_commitment") {
      state.metacognitiveMirror.nextStrategyCommitment = params.userMessage.trim();
      state.metacognitiveMirror.currentStep = "awaiting_confidence";
    } else if (state.metacognitiveMirror.currentStep === "awaiting_confidence") {
      const score = parseConfidenceScore(params.userMessage);
      if (score == null) {
        return {
          state,
          response:
            "Give me a number from 1 to 10 so I can understand how strong this feels in your own head right now.",
          userIntent: intentEnvelope.intent,
          completed: state.reportReady,
        };
      }
      state.studentConfidenceScore = score;
      state.reflection.confidenceScore = score;
      state.reflection.currentStep = "awaiting_click_moment";
      recomputeReasoningScores(state);
      state.metacognitiveMirror.currentStep = "awaiting_click_moment";
    } else {
      state.momentOfUnderstanding = params.userMessage.trim();
      state.reflection.momentOfUnderstanding = params.userMessage.trim();
      state.reflection.currentStep = "complete";
      state.metacognitiveMirror.currentStep = "complete";
      markPhaseStatus(state, currentPhase.id, "completed");
      advanceToNextPendingPhase(state);
    }
  } else if (currentPhase.type === "self_reflection") {
    if (state.reflection.currentStep === "awaiting_confidence") {
      const score = parseConfidenceScore(params.userMessage);
      if (score == null) {
        return {
          state,
          response: "Give me a number from 1 to 10 so I can get a feel for how solid this feels to you right now.",
          userIntent: intentEnvelope.intent,
          completed: state.reportReady,
        };
      }
      state.studentConfidenceScore = score;
      state.reflection.confidenceScore = score;
      state.reflection.currentStep = "awaiting_click_moment";
    } else {
      state.momentOfUnderstanding = params.userMessage.trim();
      state.reflection.momentOfUnderstanding = params.userMessage.trim();
      state.reflection.currentStep = "complete";
      markPhaseStatus(state, currentPhase.id, "completed");
      advanceToNextPendingPhase(state);
    }
  }

  const auto = await autoAdvanceUntilPause({
    state,
    access: params.access,
    runtimeContext: params.runtimeContext,
  });

  return {
    state: auto.state,
    response: uniqueStrings([...replies, auto.response]).join("\n\n"),
    userIntent: intentEnvelope.intent,
    completed: auto.state.reportReady,
  };
}
