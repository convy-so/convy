import { type ModelMessage } from "ai";

export type { ModelMessage };

export type AllowedRole = "user" | "assistant" | "tool" | "system";

export type SurveyMedia = {
  type: "image" | "video" | "audio";
  url: string;
  description?: string;
  mimeType?: string;
  altText?: string;
  durationMs?: number;
  id?: string;
};

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType?: string }
  | { type: "file"; file: string; mimeType: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown };

export type ChatMessage = {
  id: string;
  role: AllowedRole;
  content: string;
  parts?: ChatMessagePart[];
  timestamp: string;
  media?: SurveyMedia;
};

export type ExtractedData = Record<string, unknown>;

export interface VoiceAgentMessage {
  type: string;
  text?: string;
  content?: string;
  role?: string;
  description?: string;
  error?: string | Record<string, unknown>;
  awaitingAgentIntro?: boolean;
  isFinal?: boolean;
  streamId?: string;
  toolCallId?: string;
  allowedTypes?: string[];
  recommendation?: string;
  rationale?: string;
  suggestedDescription?: string;
  suggestedFeedbackFocus?: string;
  extractedData?: Record<string, unknown>;
  collectedInfo?: Record<string, unknown>;
  media?: SurveyMedia & { id: string };
  connectionId?: string;
}
