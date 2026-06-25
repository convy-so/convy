import type { SupportedLanguage } from "@/features/surveys/voice/deepgram-voice-agent";
import type { ChatMessage } from "@/shared/chat/chat-types";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
} from "@/features/surveys/server/education/types";
export interface SurveyResponseVoiceSurveyContext {
  id: string;
  userId: string;
  title: string;
  classroomId: string | null;
  programId: string | null;
  tone: string | null;
  requiredQuestions: string[] | null;
}

export type SurveyResponseVoiceBootingState = {
  phase: "booting";
  surveyLookupKey: string;
  conversationId: string;
  voiceSessionId: string;
  messages: ChatMessage[];
  language: SupportedLanguage;
};

export type SurveyResponseVoiceReadyState = {
  phase: "ready";
  surveyId: string;
  conversationId: string;
  voiceSessionId: string;
  participantId: string;
  messages: ChatMessage[];
  survey: SurveyResponseVoiceSurveyContext;
  language: SupportedLanguage;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionId: string;
  sessionState: SessionState;
  ownerId: string | null;
};

export type SurveyResponseVoiceClosedState = {
  phase: "closed";
  surveyId: string | null;
  conversationId: string;
  voiceSessionId: string;
  messages: ChatMessage[];
  language: SupportedLanguage;
};

export type SurveyResponseVoiceState =
  | SurveyResponseVoiceBootingState
  | SurveyResponseVoiceReadyState
  | SurveyResponseVoiceClosedState;

export function createBootingVoiceState(input: {
  surveyLookupKey: string;
  conversationId: string;
  voiceSessionId: string;
  language: SupportedLanguage;
}): SurveyResponseVoiceBootingState {
  return {
    phase: "booting",
    surveyLookupKey: input.surveyLookupKey,
    conversationId: input.conversationId,
    voiceSessionId: input.voiceSessionId,
    messages: [],
    language: input.language,
  };
}

export function createReadyVoiceState(input: {
  survey: SurveyResponseVoiceSurveyContext;
  conversationId: string;
  voiceSessionId: string;
  participantId: string;
  messages: ChatMessage[];
  language: SupportedLanguage;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionId: string;
  sessionState: SessionState;
  ownerId: string | null;
}): SurveyResponseVoiceReadyState {
  return {
    phase: "ready",
    surveyId: input.survey.id,
    conversationId: input.conversationId,
    voiceSessionId: input.voiceSessionId,
    participantId: input.participantId,
    messages: input.messages,
    survey: input.survey,
    language: input.language,
    brief: input.brief,
    coveragePlan: input.coveragePlan,
    sessionId: input.sessionId,
    sessionState: input.sessionState,
    ownerId: input.ownerId,
  };
}

export function createClosedVoiceState(
  state: SurveyResponseVoiceState,
): SurveyResponseVoiceClosedState {
  return {
    phase: "closed",
    surveyId: state.phase === "ready" ? state.surveyId : null,
    conversationId: state.conversationId,
    voiceSessionId: state.voiceSessionId,
    messages: state.messages,
    language: state.language,
  };
}

export function isReadyVoiceState(
  state: SurveyResponseVoiceState,
): state is SurveyResponseVoiceReadyState {
  return state.phase === "ready";
}

export function requireReadyVoiceState(
  state: SurveyResponseVoiceState,
): SurveyResponseVoiceReadyState {
  if (!isReadyVoiceState(state)) {
    throw new Error("Survey response voice state is not ready");
  }

  return state;
}
