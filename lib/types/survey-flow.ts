import { type UIMessage as SDKMessage } from "ai";

/**
 * Supported languages for Convy surveys
 */
export type SurveyLanguage = "en" | "fr" | "de" | "es" | "it";

/**
 * Survey status types
 */
export type SurveyStatus = "creating" | "active" | "archived" | "completed";

/**
 * Flags indicating which pieces of information have been collected during survey creation
 */
export interface CollectedInfoFlags {
  objective: boolean;
  targetAudience: boolean;
  scope: boolean;
  successCriteria: boolean;
  constraints: boolean;
  hypotheses: boolean;
  tone: boolean;
  requiredQuestions: boolean;
  metrics: boolean;
  personalInfo: boolean;
  subjectDefined: boolean;
  domainIdentified: boolean;
  media: boolean;
  subjectModelComplete?: boolean;
}

export interface SurveyMedia {
  type: "image" | "audio" | "video";
  url: string;
  description: string;
  contextForUse: string;
  id: string;
}

/**
 * Structured data extracted from a survey creation conversation
 */
export interface SurveyExtractionData {
  objective?: {
    goal?: string;
    context?: string | null;
    decision?: string | null;
    subjectDomain?: string | null;
    subjectDescription?: string;
  };
  targetAudience?: {
    description?: string;
    relationship?: string;
    knowledgeLevel?: "beginner" | "intermediate" | "expert";
  };
  scope?: {
    breadthVsDepth?: "broad" | "deep" | "balanced";
    mainTopics?: string[];
    boundaries?: string;
  };
  successCriteria?: {
    insightTypes?: ("emotional" | "behavioral" | "rational")[];
    detailLevel?: "high" | "medium" | "low";
    description?: string;
  };
  constraints?: {
    timeLimit?: number | null;
    sensitiveTopics?: string[];
    otherConstraints?: string | null;
  };
  hypotheses?: {
    assumptions?: string[];
  };
  tone?: "formal" | "casual" | "playful" | "empathetic" | null;
  metrics?: string[];
  personalInfo?: string[];
  title?: string;
  domainId?: number;
  isVoice?: boolean;
  media?: SurveyMedia[];
}

/**
 * Enhanced UI message type for survey conversations
 */
export interface SurveyUIMessage extends SDKMessage {
  content: string;
  displayedContent?: string;
  isTyping?: boolean;
  timestamp?: string | number;
  media?: SurveyMedia;
}

/**
 * Message type for backend/persistence
 */
export type SurveyMessage = SDKMessage & {
  displayedContent?: string;
  media?: SurveyMedia;
};

/**
 * Common response structure for survey initialization
 */
export interface SurveyInitResponse {
  survey: {
    id: string;
    title: string;
    objective?: { description?: string; goal?: string };
    targetAudience?: { description?: string };
    tone?: string;
    isVoice?: boolean;
    media?: SurveyMedia[];
    language?: SurveyLanguage;
    status?: SurveyStatus;
  };
  conversationId: string;
  participantId?: string;
  messages?: SurveyUIMessage[];
  completed?: boolean;
  collectedInfo?: CollectedInfoFlags;
  extractedData?: SurveyExtractionData;
}
