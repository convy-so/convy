import type { UIMessage as SDKMessage } from "ai";
import type { SurveyCollectedInfo, SurveyExtractedData } from "@/components/surveys/hooks/use-survey-creation-draft";

export type UIMessage = SDKMessage & {
  displayedContent?: string;
  isTyping?: boolean;
  timestamp?: number;
};

type StoredCreateMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: unknown;
  timestamp?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConversationRole(role: string): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

export function getTextFromChatParts(parts?: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

export function getDisplayedMessageText(message: {
  displayedContent?: string;
  parts?: SDKMessage["parts"];
}): string {
  return message.displayedContent || getTextFromChatParts(message.parts);
}

export function normalizeChatMessageParts(
  value: unknown,
): NonNullable<UIMessage["parts"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((part): NonNullable<UIMessage["parts"]> => {
    if (!isRecord(part) || typeof part.type !== "string") {
      return [];
    }

    switch (part.type) {
      case "text":
        return typeof part.text === "string"
          ? [{ type: "text" as const, text: part.text }]
          : [];
      case "image":
        return typeof part.image === "string"
          ? [
              {
                type: "data-image" as const,
                data: { image: part.image, mimeType: part.mimeType },
              },
            ]
          : [];
      case "file":
        return typeof part.file === "string" &&
          typeof part.mimeType === "string"
          ? [
              {
                type: "data-file" as const,
                data: { file: part.file, mimeType: part.mimeType },
              },
            ]
          : [];
      case "tool-call":
        return typeof part.toolCallId === "string" &&
          typeof part.toolName === "string"
          ? [
              {
                type: `tool-${part.toolName}` as `tool-${string}`,
                toolCallId: part.toolCallId,
                state: "input-streaming" as const,
                input: part.input || {},
              },
            ]
          : [];
      case "tool-result":
        return typeof part.toolCallId === "string" &&
          typeof part.toolName === "string"
          ? [
              {
                type: `tool-${part.toolName}` as `tool-${string}`,
                toolCallId: part.toolCallId,
                state: "output-available" as const,
                input: {},
                output: part.result,
              },
            ]
          : [];
      default:
        return [];
    }
  });
}

function normalizeCreateMessage(
  message: StoredCreateMessage,
  index: number,
): UIMessage | null {
  if (!isConversationRole(message.role)) {
    return null;
  }

  const parts =
    Array.isArray(message.parts) && message.parts.length > 0
      ? normalizeChatMessageParts(message.parts)
      : message.content
        ? [{ type: "text" as const, text: message.content }]
        : [];

  return {
    id: message.id || `msg-${index}-${Date.now()}`,
    role: message.role,
    displayedContent: message.content || getTextFromChatParts(parts),
    isTyping: false,
    parts,
    timestamp: message.timestamp
      ? new Date(message.timestamp).getTime()
      : undefined,
  };
}

export function normalizeCreateMessages(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message, index) => {
    if (!isRecord(message) || typeof message.role !== "string") {
      return [];
    }

    const normalized = normalizeCreateMessage(
      {
        id: typeof message.id === "string" ? message.id : undefined,
        role: message.role,
        content:
          typeof message.content === "string" ? message.content : undefined,
        parts: normalizeChatMessageParts(message.parts),
        timestamp:
          typeof message.timestamp === "string" ? message.timestamp : undefined,
      },
      index,
    );

    return normalized ? [normalized] : [];
  });
}

export function normalizeCollectedInfo(
  value: unknown,
): SurveyCollectedInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    objective:
      typeof value.objective === "boolean" ? value.objective : undefined,
    targetAudience:
      typeof value.targetAudience === "boolean"
        ? value.targetAudience
        : undefined,
    subjectDefined:
      typeof value.subjectDefined === "boolean"
        ? value.subjectDefined
        : undefined,
    programIdentified:
      typeof value.programIdentified === "boolean"
        ? value.programIdentified
        : undefined,
    scope: typeof value.scope === "boolean" ? value.scope : undefined,
    successCriteria:
      typeof value.successCriteria === "boolean"
        ? value.successCriteria
        : undefined,
    constraints:
      typeof value.constraints === "boolean" ? value.constraints : undefined,
    tone: typeof value.tone === "boolean" ? value.tone : undefined,
    requiredQuestions:
      typeof value.requiredQuestions === "boolean"
        ? value.requiredQuestions
        : undefined,
    metrics: typeof value.metrics === "boolean" ? value.metrics : undefined,
    personalInfo:
      typeof value.personalInfo === "boolean" ? value.personalInfo : undefined,
  };
}

export function normalizeExtractedData(
  value: unknown,
): SurveyExtractedData | null {
  if (!isRecord(value)) {
    return null;
  }

  const objective =
    isRecord(value.objective) && typeof value.objective.goal === "string"
      ? { goal: value.objective.goal }
      : undefined;
  const targetAudience =
    isRecord(value.targetAudience) &&
    typeof value.targetAudience.description === "string"
      ? { description: value.targetAudience.description }
      : undefined;

  return {
    objective,
    targetAudience,
    programId:
      typeof value.programId === "string" ? value.programId : undefined,
    readyForSampling:
      typeof value.readyForSampling === "boolean"
        ? value.readyForSampling
        : undefined,
    mediaDecision: value.mediaDecision,
  };
}
