/**
 * Conversation Memory and Context Management System
 *
 * This module provides:
 * - Rolling context summarization for long conversations
 * - Conversation state machine for flow control
 * - Memory synthesis for better AI responses
 * - Progress tracking for survey responses
 * - Adaptive pacing based on time and participant style
 */

import type { SurveyConfig } from "./prompts";

// ============================================================================
// CONVERSATION STATE MACHINE
// ============================================================================

export type ConversationState =
  | "GREETING"
  | "EXPLORING_INITIAL"
  | "DRILLING_DEEPER"
  | "COVERING_TOPIC"
  | "TRANSITIONING"
  | "CHECKING_COVERAGE"
  | "WRAPPING_UP"
  | "CONCLUDING";

export type ParticipantStyle = "verbose" | "concise" | "hesitant" | "neutral";

export interface ConversationStateContext {
  currentState: ConversationState;
  previousState: ConversationState | null;
  stateEnteredAt: number; // message index
  transitionReason: string | null;
}

// ============================================================================
// CONVERSATION MEMORY STRUCTURE
// ============================================================================

export interface ConversationMemory {
  // Key facts learned from the conversation
  keyFactsLearned: string[];

  // Topics that have been adequately covered
  topicsCovered: string[];

  // Current topic being discussed
  currentTopic: string | null;

  // Questions that were asked but not answered or need follow-up
  unansweredQuestions: string[];

  // Required questions/topics that still need to be covered
  remainingRequiredTopics: string[];

  // Participant communication style
  participantStyle: ParticipantStyle;

  // Emotional signals detected (e.g., "frustrated", "enthusiastic", "uncertain")
  emotionalSignals: string[];

  // Hypotheses evidence (for surveys with hypotheses)
  hypothesesEvidence: Record<
    string,
    { supporting: string[]; contradicting: string[] }
  >;

  // Summary of conversation so far (for context compression)
  conversationSummary: string;

  // Last update timestamp
  lastUpdated: string;

  // NEW: Follow-up depth tracking per topic (how many follow-ups on each topic)
  followUpDepthByTopic: Record<string, number>;

  // NEW: Specific examples collected (quotes, stories, concrete instances)
  specificExamples: string[];

  // NEW: Unexplored hypotheses that still need investigation
  unexploredHypotheses: string[];

  // NEW: Timeline events (when things changed/started for participant)
  timelineEvents: string[];

  // NEW: Peer/social context (did participant mention others experiencing same thing?)
  peerContext: string[];

  // NEW: Solutions suggested by participant
  participantSuggestedSolutions: string[];
}

// ============================================================================
// CONVERSATION QUALITY SIGNALS
// ============================================================================

export interface ConversationQualitySignals {
  // Average response length (words)
  averageResponseLength: number;

  // Response length trend (increasing, decreasing, stable)
  responseLengthTrend: "increasing" | "decreasing" | "stable";

  // Number of one-word or very short responses
  shortResponseCount: number;

  // Number of topic avoidance signals
  topicAvoidanceCount: number;

  // Engagement level (high, medium, low)
  engagementLevel: "high" | "medium" | "low";

  // Detected hesitation patterns
  hesitationPatterns: string[];
}

// ============================================================================
// CONVERSATION PROGRESS TRACKING (for survey responses)
// ============================================================================

export interface ConversationProgress {
  // Which required questions have been covered
  coveredRequiredQuestions: string[];

  // Which metrics have data collected
  collectedMetrics: string[];

  // Which hypotheses have been explored
  exploredHypotheses: string[];

  // Overall completion percentage
  completionPercentage: number;

  // Time elapsed in minutes
  elapsedMinutes: number;

  // Message count
  messageCount: number;

  // Estimated remaining topics
  remainingTopicsCount: number;

  // Should wrap up soon (based on time/coverage)
  shouldWrapUp: boolean;

  // Wrap up reason if applicable
  wrapUpReason: string | null;
}

// ============================================================================
// ROLLING CONTEXT MANAGEMENT
// ============================================================================

export interface RollingContext {
  // Associated survey ID (Security)
  surveyId: string;

  // Summarized older messages
  historySummary: string;

  // Recent messages kept in full (last N exchanges)
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;

  // Key facts that must always be retained
  persistentFacts: string[];

  // Current conversation memory
  memory: ConversationMemory;

  // Progress tracking
  progress: ConversationProgress;

  // Quality signals
  qualitySignals: ConversationQualitySignals;

  // State context
  stateContext: ConversationStateContext;
}

// ============================================================================
// REDIS KEY HELPERS
// ============================================================================

export const getContextKey = (conversationId: string) =>
  `conv:context:${conversationId}`;
export const getStartTimeKey = (conversationId: string) =>
  `conv:start:${conversationId}`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate word count for a message
 */
function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Detect participant style from response patterns
 */
export function detectParticipantStyle(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): ParticipantStyle {
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length < 2) return "neutral";

  const avgWordCount =
    userMessages.reduce((sum, m) => sum + getWordCount(m.content), 0) /
    userMessages.length;

  // Check for hesitation patterns
  const hesitationPhrases = [
    "i'm not sure",
    "i don't know",
    "maybe",
    "i guess",
    "um",
    "uh",
    "hmm",
    "let me think",
    "that's a good question",
  ];

  const hasHesitation = userMessages.some((m) =>
    hesitationPhrases.some((phrase) =>
      m.content.toLowerCase().includes(phrase),
    ),
  );

  if (hasHesitation && avgWordCount < 20) return "hesitant";
  if (avgWordCount > 50) return "verbose";
  if (avgWordCount < 15) return "concise";
  return "neutral";
}

/**
 * Calculate quality signals from conversation
 */
export function calculateQualitySignals(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): ConversationQualitySignals {
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) {
    return {
      averageResponseLength: 0,
      responseLengthTrend: "stable",
      shortResponseCount: 0,
      topicAvoidanceCount: 0,
      engagementLevel: "medium",
      hesitationPatterns: [],
    };
  }

  const wordCounts = userMessages.map((m) => getWordCount(m.content));
  const averageResponseLength =
    wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;

  // Calculate trend
  let responseLengthTrend: "increasing" | "decreasing" | "stable" = "stable";
  if (wordCounts.length >= 3) {
    const firstHalf = wordCounts.slice(0, Math.floor(wordCounts.length / 2));
    const secondHalf = wordCounts.slice(Math.floor(wordCounts.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (secondAvg > firstAvg * 1.3) responseLengthTrend = "increasing";
    else if (secondAvg < firstAvg * 0.7) responseLengthTrend = "decreasing";
  }

  // Count short responses
  const shortResponseCount = wordCounts.filter((c) => c < 5).length;

  // Detect topic avoidance
  const avoidancePhrases = [
    "i'd rather not",
    "next question",
    "can we move on",
    "i don't want to",
    "skip",
    "pass",
    "not relevant",
  ];

  const topicAvoidanceCount = userMessages.filter((m) =>
    avoidancePhrases.some((phrase) => m.content.toLowerCase().includes(phrase)),
  ).length;

  // Detect hesitation patterns
  const hesitationPhrases = [
    "i'm not sure",
    "i don't know",
    "maybe",
    "i guess",
    "let me think",
  ];

  const hesitationPatterns = hesitationPhrases.filter((phrase) =>
    userMessages.some((m) => m.content.toLowerCase().includes(phrase)),
  );

  // Calculate engagement level
  let engagementLevel: "high" | "medium" | "low" = "medium";
  if (averageResponseLength > 40 && shortResponseCount < 2) {
    engagementLevel = "high";
  } else if (
    averageResponseLength < 15 ||
    shortResponseCount > userMessages.length / 2
  ) {
    engagementLevel = "low";
  }

  return {
    averageResponseLength,
    responseLengthTrend,
    shortResponseCount,
    topicAvoidanceCount,
    engagementLevel,
    hesitationPatterns,
  };
}

/**
 * Determine the appropriate conversation state based on progress
 */
export function determineConversationState(
  progress: ConversationProgress,
  messageCount: number,
  config: SurveyConfig,
): ConversationState {
  // First message - greeting
  if (messageCount <= 1) return "GREETING";

  // Check if we should wrap up
  if (progress.shouldWrapUp) return "WRAPPING_UP";

  // Check completion
  if (progress.completionPercentage >= 90) return "CONCLUDING";
  if (progress.completionPercentage >= 75) return "CHECKING_COVERAGE";

  // Early exploration
  if (messageCount <= 4) return "EXPLORING_INITIAL";

  // Active topic coverage
  if (progress.remainingTopicsCount > 0) {
    // Check if we need to transition to a new topic
    if (messageCount % 4 === 0) return "TRANSITIONING";
    return "COVERING_TOPIC";
  }

  // Drilling deeper on covered topics
  return "DRILLING_DEEPER";
}

/**
 * Calculate conversation progress for survey responses
 */
export function calculateProgress(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig,
  startTime: Date,
  coveredTopics: string[],
): ConversationProgress {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / 1000 / 60;

  const totalRequiredQuestions = config.requiredQuestions.length || 1;
  const coveredRequiredQuestions = config.requiredQuestions.filter((q) =>
    coveredTopics.some(
      (t) =>
        t.toLowerCase().includes(q.toLowerCase().slice(0, 20)) ||
        q.toLowerCase().includes(t.toLowerCase().slice(0, 20)),
    ),
  );

  const completionPercentage = Math.min(
    100,
    Math.round(
      (coveredRequiredQuestions.length / totalRequiredQuestions) * 100,
    ),
  );

  const remainingTopicsCount =
    totalRequiredQuestions - coveredRequiredQuestions.length;

  // Determine if we should wrap up
  const timeLimit = config.expertState?.constraints?.timeLimit || 30;
  const shouldWrapUpTime = elapsedMinutes >= timeLimit * 0.85; // 85% of time
  const shouldWrapUpCoverage = completionPercentage >= 85;
  const shouldWrapUpLength = messages.length >= 40; // Too many messages

  const shouldWrapUp =
    shouldWrapUpTime || (shouldWrapUpCoverage && messages.length >= 10);

  let wrapUpReason: string | null = null;
  if (shouldWrapUpTime) {
    wrapUpReason = `Approaching time limit (${Math.round(elapsedMinutes)}/${timeLimit} minutes)`;
  } else if (shouldWrapUpLength) {
    wrapUpReason = "Conversation length reaching natural conclusion point";
  } else if (shouldWrapUpCoverage) {
    wrapUpReason = "All main topics have been covered";
  }

  return {
    coveredRequiredQuestions,
    collectedMetrics: [],
    exploredHypotheses: [],
    completionPercentage,
    elapsedMinutes,
    messageCount: messages.length,
    remainingTopicsCount,
    shouldWrapUp,
    wrapUpReason,
  };
}

/**
 * Initialize empty conversation memory
 */
export function createEmptyMemory(config: SurveyConfig): ConversationMemory {
  const hypothesesEvidence: Record<
    string,
    { supporting: string[]; contradicting: string[] }
  > = {};

  const unexploredHypotheses: string[] = [];

  if (config.expertState?.hypotheses?.assumptions) {
    for (const hypothesis of config.expertState.hypotheses.assumptions) {
      hypothesesEvidence[hypothesis] = { supporting: [], contradicting: [] };
      unexploredHypotheses.push(hypothesis);
    }
  }

  return {
    keyFactsLearned: [],
    topicsCovered: [],
    currentTopic: null,
    unansweredQuestions: [],
    remainingRequiredTopics: [...(config.requiredQuestions || [])],
    participantStyle: "neutral",
    emotionalSignals: [],
    hypothesesEvidence,
    conversationSummary: "",
    lastUpdated: new Date().toISOString(),
    followUpDepthByTopic: {},
    specificExamples: [],
    unexploredHypotheses,
    timelineEvents: [],
    peerContext: [],
    participantSuggestedSolutions: [],
  };
}

/**
 * Initialize rolling context
 */
export function createRollingContext(
  surveyId: string,
  config: SurveyConfig,
  startTime: Date,
): RollingContext {
  return {
    surveyId,
    historySummary: "",
    recentMessages: [],
    persistentFacts: [],
    memory: createEmptyMemory(config),
    progress: {
      coveredRequiredQuestions: [],
      collectedMetrics: [],
      exploredHypotheses: [],
      completionPercentage: 0,
      elapsedMinutes: 0,
      messageCount: 0,
      remainingTopicsCount: config.requiredQuestions?.length || 0,
      shouldWrapUp: false,
      wrapUpReason: null,
    },
    qualitySignals: {
      averageResponseLength: 0,
      responseLengthTrend: "stable",
      shortResponseCount: 0,
      topicAvoidanceCount: 0,
      engagementLevel: "medium",
      hesitationPatterns: [],
    },
    stateContext: {
      currentState: "GREETING",
      previousState: null,
      stateEnteredAt: 0,
      transitionReason: null,
    },
  };
}

// ============================================================================
// CONTEXT COMPRESSION (Rolling Context Strategy)
// ============================================================================

const MAX_RECENT_MESSAGES = 8; // Keep last 8 messages in full
const SUMMARY_TRIGGER_THRESHOLD = 12; // Start summarizing after 12 messages

/**
 * Build a compressed context from full conversation history
 */
export function buildCompressedContext(
  fullMessages: Array<{ role: "user" | "assistant"; content: string }>,
  existingContext: RollingContext,
): RollingContext {
  const messageCount = fullMessages.length;

  // If conversation is short, keep everything
  if (messageCount <= MAX_RECENT_MESSAGES) {
    return {
      ...existingContext,
      recentMessages: fullMessages,
      historySummary: "",
    };
  }

  // Split into older and recent messages
  const splitPoint = messageCount - MAX_RECENT_MESSAGES;
  const olderMessages = fullMessages.slice(0, splitPoint);
  const recentMessages = fullMessages.slice(splitPoint);

  // Build summary of older messages (will be updated by AI later)
  // FIXED: Prefer the AI-generated summary from memory if available, otherwise fall back to existing history or quick summary
  const historySummary =
    existingContext.memory.conversationSummary ||
    existingContext.historySummary ||
    buildQuickSummary(olderMessages);

  return {
    ...existingContext,
    historySummary,
    recentMessages,
  };
}

/**
 * Build a quick structural summary (non-AI, for initial context)
 */
function buildQuickSummary(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  if (messages.length === 0) return "";

  const exchangeCount = Math.floor(messages.length / 2);
  const topicIndicators: string[] = [];

  // Extract key phrases from user messages
  const userMessages = messages.filter((m) => m.role === "user");
  for (const msg of userMessages.slice(0, 5)) {
    // Get first sentence or first 100 chars
    const firstSentence = msg.content.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 10) {
      topicIndicators.push(firstSentence.slice(0, 80));
    }
  }

  return `[Earlier in conversation - ${exchangeCount} exchanges] Key topics discussed: ${topicIndicators.join("; ")}`;
}

/**
 * Format rolling context for injection into system prompt
 * Enhanced with improvement tracking and prompts based on analysis
 */
export function formatContextForPrompt(context: RollingContext): string {
  const parts: string[] = [];

  // Add conversation summary if exists
  if (context.historySummary) {
    parts.push(`CONVERSATION HISTORY SUMMARY:\n${context.historySummary}`);
  }

  // Add key facts
  if (context.memory.keyFactsLearned.length > 0) {
    parts.push(
      `KEY FACTS LEARNED:\n${context.memory.keyFactsLearned.map((f) => `• ${f}`).join("\n")}`,
    );
  }

  // Add specific examples collected (for quality tracking)
  if (context.memory.specificExamples.length > 0) {
    parts.push(
      `SPECIFIC EXAMPLES/QUOTES COLLECTED:\n${context.memory.specificExamples.map((e) => `"${e}"`).join("\n")}`,
    );
  }

  // Add topics covered with depth info
  if (context.memory.topicsCovered.length > 0) {
    const topicsWithDepth = context.memory.topicsCovered.map((t) => {
      const depth = context.memory.followUpDepthByTopic[t] || 0;
      const depthIndicator = depth >= 3 ? "✓✓✓" : depth >= 2 ? "✓✓" : "✓";
      return `${depthIndicator} ${t} (${depth} follow-ups)`;
    });
    parts.push(
      `TOPICS COVERED (with follow-up depth):\n${topicsWithDepth.join("\n")}`,
    );
  }

  // Add remaining topics
  if (context.memory.remainingRequiredTopics.length > 0) {
    parts.push(
      `TOPICS STILL TO COVER:\n${context.memory.remainingRequiredTopics.map((t) => `○ ${t}`).join("\n")}`,
    );
  }

  // Add unexplored hypotheses (prompting for investigation)
  if (context.memory.unexploredHypotheses.length > 0) {
    parts.push(
      `⚠️ UNEXPLORED HYPOTHESES (need to investigate):\n${context.memory.unexploredHypotheses.map((h) => `? ${h}`).join("\n")}\n` +
        `TIP: Ask questions that would reveal evidence for or against these hypotheses.`,
    );
  }

  // Add timeline events discovered
  if (context.memory.timelineEvents.length > 0) {
    parts.push(
      `TIMELINE DISCOVERED:\n${context.memory.timelineEvents.map((e) => `📅 ${e}`).join("\n")}`,
    );
  }

  // Add peer context
  if (context.memory.peerContext.length > 0) {
    parts.push(
      `PEER/SOCIAL CONTEXT:\n${context.memory.peerContext.map((p) => `👥 ${p}`).join("\n")}`,
    );
  }

  // Add participant suggested solutions
  if (context.memory.participantSuggestedSolutions.length > 0) {
    parts.push(
      `SOLUTIONS SUGGESTED BY PARTICIPANT:\n${context.memory.participantSuggestedSolutions.map((s) => `💡 ${s}`).join("\n")}`,
    );
  }

  // Add current state and pacing info
  parts.push(
    `CONVERSATION STATE: ${context.stateContext.currentState}` +
      `\nPROGRESS: ${context.progress.completionPercentage}% complete, ` +
      `${Math.round(context.progress.elapsedMinutes)} minutes elapsed`,
  );

  // Add participant style adaptation
  if (context.memory.participantStyle !== "neutral") {
    const styleGuidance: Record<ParticipantStyle, string> = {
      verbose:
        "Participant is sharing detailed responses. You can ask more focused follow-ups.",
      concise:
        "Participant gives brief answers. Ask specific questions and gently encourage elaboration.",
      hesitant:
        "Participant seems uncertain. Use encouraging language and offer examples.",
      neutral: "",
    };
    parts.push(
      `PARTICIPANT STYLE: ${styleGuidance[context.memory.participantStyle]}`,
    );
  }

  // Add depth prompting if needed
  const shallowTopics = context.memory.topicsCovered.filter(
    (t) => (context.memory.followUpDepthByTopic[t] || 0) < 2,
  );
  if (shallowTopics.length > 0 && !context.progress.shouldWrapUp) {
    parts.push(
      `💬 NEED MORE DEPTH ON:\n${shallowTopics.map((t) => `- ${t} (consider follow-up questions)`).join("\n")}`,
    );
  }

  // Add wrap-up guidance if needed
  if (context.progress.shouldWrapUp) {
    parts.push(
      `⚠️ WRAP-UP NEEDED: ${context.progress.wrapUpReason}\n` +
        `Begin transitioning to conclusion. Cover any critical remaining points briefly.`,
    );
  }

  // Add hypotheses evidence if relevant
  const hypothesesWithEvidence = Object.entries(
    context.memory.hypothesesEvidence,
  ).filter(
    ([, evidence]) =>
      evidence.supporting.length > 0 || evidence.contradicting.length > 0,
  );

  if (hypothesesWithEvidence.length > 0) {
    const evidenceLines = hypothesesWithEvidence.map(
      ([hypothesis, evidence]) => {
        const supportCount = evidence.supporting.length;
        const contradictCount = evidence.contradicting.length;
        const status =
          supportCount > contradictCount
            ? "SUPPORTED"
            : contradictCount > supportCount
              ? "CONTRADICTED"
              : "MIXED";
        return `• "${hypothesis.slice(0, 50)}..." → ${status} (${supportCount}+ / ${contradictCount}-)`;
      },
    );
    parts.push(`HYPOTHESES STATUS:\n${evidenceLines.join("\n")}`);
  }

  // Add conversation improvement prompts
  const improvementPrompts = getConversationImprovementPrompts(context);
  if (improvementPrompts) {
    parts.push(improvementPrompts);
  }

  return parts.join("\n\n");
}

/**
 * Generate improvement prompts based on conversation state
 * These prompt the AI to use specific techniques for better insights
 */
function getConversationImprovementPrompts(
  context: RollingContext,
): string | null {
  const prompts: string[] = [];

  // If no timeline events yet, prompt for timeline exploration
  if (
    context.memory.timelineEvents.length === 0 &&
    context.progress.messageCount > 4
  ) {
    prompts.push(
      "• Ask about WHEN things started or changed: 'Has this always been the case, or did something change?'",
    );
  }

  // If no peer context yet, prompt for social validation
  if (
    context.memory.peerContext.length === 0 &&
    context.progress.messageCount > 6
  ) {
    prompts.push(
      "• Explore if OTHERS share this experience: 'Do you think others feel the same way?'",
    );
  }

  // If few specific examples, prompt for stories
  if (
    context.memory.specificExamples.length < 2 &&
    context.progress.messageCount > 4
  ) {
    prompts.push(
      "• Get SPECIFIC EXAMPLES: 'Can you walk me through a specific time when that happened?'",
    );
  }

  // If no solutions yet and past mid-point, prompt for solutions
  if (
    context.memory.participantSuggestedSolutions.length === 0 &&
    context.progress.completionPercentage > 50
  ) {
    prompts.push(
      "• Ask for their IDEAS: 'If you could change one thing about this, what would it be?'",
    );
  }

  // If topics have low depth, prompt for deeper follow-ups
  const depths = Object.values(context.memory.followUpDepthByTopic);
  const avgDepth =
    depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
  if (avgDepth < 2 && context.progress.messageCount > 6) {
    prompts.push(
      "• Go DEEPER: Ask 'why' or 'what made you feel that way' to get beyond surface answers",
    );
  }

  if (prompts.length === 0) return null;

  return `📋 CONVERSATION IMPROVEMENT TIPS:\n${prompts.join("\n")}`;
}

/**
 * Get messages formatted for AI (with context injection)
 */
export function getMessagesForAI(
  context: RollingContext,
): Array<{ role: "user" | "assistant"; content: string }> {
  // If there's a history summary, inject it as the first system-like message
  if (context.historySummary && context.recentMessages.length > 0) {
    // Add a context marker before recent messages
    const contextMarker = {
      role: "assistant" as const,
      content: `[Continuing our conversation. ${context.historySummary}]`,
    };
    return [contextMarker, ...context.recentMessages];
  }

  return context.recentMessages;
}

// ============================================================================
// MEMORY UPDATE EXTRACTION PROMPT
// ============================================================================

/**
 * Generate prompt for AI to update conversation memory
 */
export function getMemoryUpdatePrompt(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig,
  existingMemory: ConversationMemory,
): string {
  const recentExchanges = messages.slice(-6); // Last 3 exchanges
  const conversationText = recentExchanges
    .map(
      (m) =>
        `${m.role === "user" ? "Participant" : "Interviewer"}: ${m.content}`,
    )
    .join("\n");

  const hypothesesList =
    config.expertState?.hypotheses?.assumptions?.join("; ") || "None specified";
  const unexploredHypotheses =
    existingMemory.unexploredHypotheses.join("; ") || "All explored";

  return `Analyze the recent conversation and update the conversation memory.

SURVEY CONTEXT:
- Goal: ${config.coreObjective || config.expertState?.objective?.goal || config.information || "Gather feedback"}
- Required Topics: ${config.requiredQuestions?.join(", ") || "General feedback"}
- Hypotheses to Test: ${hypothesesList}
- Unexplored Hypotheses: ${unexploredHypotheses}

CURRENT MEMORY STATE:
- Topics Covered: ${existingMemory.topicsCovered.join(", ") || "None yet"}
- Key Facts: ${existingMemory.keyFactsLearned.join("; ") || "None yet"}
- Current Topic: ${existingMemory.currentTopic || "None"}
- Specific Examples Collected: ${existingMemory.specificExamples.length}
- Timeline Events: ${existingMemory.timelineEvents.join("; ") || "None yet"}

RECENT CONVERSATION:
${conversationText}

Extract and return a JSON object. IMPORTANT: Look specifically for:
1. Specific examples, quotes, or stories the participant shared
2. Timeline information (when things started, changed, or happened)
3. Peer/social context (did they mention others experiencing the same thing?)
4. Solutions or suggestions the participant proposed
5. Evidence for/against our hypotheses

{
  "newKeyFacts": ["array of new important facts learned"],
  "newTopicsCovered": ["array of topics that were adequately discussed"],
  "currentTopic": "the topic currently being discussed or null",
  "unansweredQuestions": ["questions asked but not answered"],
  "emotionalSignals": ["detected emotional states like 'frustrated', 'enthusiastic'"],
  "hypothesesEvidence": {
    "hypothesis text": {
      "supporting": ["evidence supporting this hypothesis"],
      "contradicting": ["evidence contradicting this hypothesis"]
    }
  },
  "conversationSummary": "2-3 sentence summary of the conversation so far",
  "specificExamples": ["direct quotes or specific stories from participant"],
  "timelineEvents": ["when things started/changed, e.g., 'Started feeling this 6 months ago'"],
  "peerContext": ["mentions of others experiencing same thing"],
  "participantSuggestedSolutions": ["solutions or improvements participant suggested"],
  "followUpDepthByTopic": {"topic name": 3} // how many follow-ups on this topic
}

Be concise. Only include genuinely new information not already in the memory.`;
}

/**
 * Schema for memory update response
 */
export const memoryUpdateSchema = {
  type: "object",
  properties: {
    newKeyFacts: { type: "array", items: { type: "string" } },
    newTopicsCovered: { type: "array", items: { type: "string" } },
    currentTopic: { type: ["string", "null"] },
    unansweredQuestions: { type: "array", items: { type: "string" } },
    emotionalSignals: { type: "array", items: { type: "string" } },
    hypothesesEvidence: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          supporting: { type: "array", items: { type: "string" } },
          contradicting: { type: "array", items: { type: "string" } },
        },
      },
    },
    conversationSummary: { type: "string" },
  },
  required: ["newKeyFacts", "newTopicsCovered", "conversationSummary"],
} as const;

/**
 * Apply memory update to existing memory
 */
export function applyMemoryUpdate(
  existingMemory: ConversationMemory,
  update: {
    newKeyFacts?: string[];
    newTopicsCovered?: string[];
    currentTopic?: string | null;
    unansweredQuestions?: string[];
    emotionalSignals?: string[];
    hypothesesEvidence?: Record<
      string,
      { supporting?: string[]; contradicting?: string[] }
    >;
    conversationSummary?: string;
    specificExamples?: string[];
    timelineEvents?: string[];
    peerContext?: string[];
    participantSuggestedSolutions?: string[];
    followUpDepthByTopic?: Record<string, number>;
  },
  config: SurveyConfig,
): ConversationMemory {
  // Merge key facts (deduplicate)
  const keyFactsLearned = [
    ...new Set([
      ...existingMemory.keyFactsLearned,
      ...(update.newKeyFacts || []),
    ]),
  ].slice(-20); // Keep last 20 facts

  // Merge topics covered
  const topicsCovered = [
    ...new Set([
      ...existingMemory.topicsCovered,
      ...(update.newTopicsCovered || []),
    ]),
  ];

  // Update remaining required topics
  const remainingRequiredTopics = (config.requiredQuestions || []).filter(
    (q) =>
      !topicsCovered.some(
        (t) =>
          t.toLowerCase().includes(q.toLowerCase().slice(0, 20)) ||
          q.toLowerCase().includes(t.toLowerCase().slice(0, 20)),
      ),
  );

  // Merge hypotheses evidence and update unexplored
  const hypothesesEvidence = { ...existingMemory.hypothesesEvidence };
  const exploredHypotheses = new Set<string>();

  if (update.hypothesesEvidence) {
    for (const [hypothesis, evidence] of Object.entries(
      update.hypothesesEvidence,
    )) {
      if (hypothesesEvidence[hypothesis]) {
        hypothesesEvidence[hypothesis] = {
          supporting: [
            ...hypothesesEvidence[hypothesis].supporting,
            ...(evidence.supporting || []),
          ],
          contradicting: [
            ...hypothesesEvidence[hypothesis].contradicting,
            ...(evidence.contradicting || []),
          ],
        };
        // Mark as explored if we have any evidence
        if (
          (evidence.supporting?.length || 0) > 0 ||
          (evidence.contradicting?.length || 0) > 0
        ) {
          exploredHypotheses.add(hypothesis);
        }
      }
    }
  }

  // Update unexplored hypotheses
  const unexploredHypotheses = existingMemory.unexploredHypotheses.filter(
    (h) => !exploredHypotheses.has(h),
  );

  // Merge follow-up depth tracking
  const followUpDepthByTopic = { ...existingMemory.followUpDepthByTopic };
  if (update.followUpDepthByTopic) {
    for (const [topic, depth] of Object.entries(update.followUpDepthByTopic)) {
      followUpDepthByTopic[topic] = Math.max(
        followUpDepthByTopic[topic] || 0,
        depth,
      );
    }
  }

  return {
    keyFactsLearned,
    topicsCovered,
    currentTopic: update.currentTopic ?? existingMemory.currentTopic,
    unansweredQuestions:
      update.unansweredQuestions || existingMemory.unansweredQuestions,
    remainingRequiredTopics,
    participantStyle: existingMemory.participantStyle,
    emotionalSignals: [
      ...new Set([
        ...existingMemory.emotionalSignals,
        ...(update.emotionalSignals || []),
      ]),
    ].slice(-10),
    hypothesesEvidence,
    conversationSummary:
      update.conversationSummary || existingMemory.conversationSummary,
    lastUpdated: new Date().toISOString(),
    // New fields
    followUpDepthByTopic,
    specificExamples: [
      ...new Set([
        ...existingMemory.specificExamples,
        ...(update.specificExamples || []),
      ]),
    ].slice(-15),
    unexploredHypotheses,
    timelineEvents: [
      ...new Set([
        ...existingMemory.timelineEvents,
        ...(update.timelineEvents || []),
      ]),
    ].slice(-10),
    peerContext: [
      ...new Set([
        ...existingMemory.peerContext,
        ...(update.peerContext || []),
      ]),
    ].slice(-5),
    participantSuggestedSolutions: [
      ...new Set([
        ...existingMemory.participantSuggestedSolutions,
        ...(update.participantSuggestedSolutions || []),
      ]),
    ].slice(-10),
  };
}
