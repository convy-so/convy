import { getAnalyticsState } from "./storage";
import {
  type AnalyticsGenerationMetadata,
  type AnalyticsSnapshot,
  type ConversationInsight,
} from "./types";

import * as SessionService from "./analytics-session-service";
import * as SnapshotService from "./analytics-snapshot-service";
import * as ChatService from "./analytics-chat-service";

/**
 * Orchestrator for building a complete survey analytics snapshot.
 * Delegates to SnapshotService for the heavy lifting.
 */
export async function buildAnalyticsSnapshot(
  surveyId: string,
  generation?: Partial<AnalyticsGenerationMetadata>,
): Promise<AnalyticsSnapshot | null> {
  return SnapshotService.buildAnalyticsSnapshot(surveyId, generation);
}

/**
 * Orchestrator for building qualitative insights for a single session.
 * Delegates to SessionService.
 */
export async function buildSessionInsight(sessionId: string): Promise<ConversationInsight | null> {
  return SessionService.buildSessionInsight(sessionId);
}

/**
 * Handles interactive questions about survey data.
 * Orchestrates classification, retrieval, and answering.
 */
export async function askAnalyticsQuestion(params: {
  surveyId: string;
  question: string;
}) {
  const classifier = await ChatService.classifyQuestionIntent(params.surveyId, params.question);
  
  const context = await ChatService.retrieveQuestionContext({
    surveyId: params.surveyId,
    question: params.question,
    classifier,
  });

  return ChatService.answerAnalyticsQuestion({
    surveyId: params.surveyId,
    question: params.question,
    context,
    classifier,
  });
}

/**
 * Utility to check the current generation state of a survey's analytics
 */
export async function getSurveyAnalyticsState(surveyId: string) {
  return getAnalyticsState(surveyId);
}
