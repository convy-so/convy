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

const INTERNAL_CREATE_MESSAGE_PATTERNS = [
  /^start the conversation now\./i,
  /system prompt instructions/i,
];

const LEGACY_SURVEY_CREATE_GREETING_PATTERNS = [
  /^hello!\s*i(?:'|’)m here to help you design a study to see how well your course is building real mastery\.\s*to get us started, could you tell me what specific skill or task you want your students to be able to perform confidently by the end of the course\?\s*$/i,
  /^hi\.\s*i(?:'|’)ll help you shape this education study\.\s*what part of the student, learner, or school experience do you want to understand better\?\s*$/i,
  /^bonjour\.\s*je vais vous aider a cadrer cette etude\.\s*quelle partie de l'experience des eleves, des apprenants ou de l'ecole voulez-vous mieux comprendre\s*\?\s*$/i,
  /^hallo\.\s*ich helfe ihnen dabei, diese studie zu strukturieren\.\s*welchen teil der lern-, schul- oder studierendenerfahrung moechten sie besser verstehen\?\s*$/i,
];

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

export function isInternalSurveyCreateMessageText(text: string): boolean {
  const normalized = text.trim();
  return INTERNAL_CREATE_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isLegacySurveyCreateGreetingText(text: string): boolean {
  const normalized = text.trim();
  return LEGACY_SURVEY_CREATE_GREETING_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
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

  const displayedContent = message.content || getTextFromChatParts(parts);

  if (isInternalSurveyCreateMessageText(displayedContent)) {
    return null;
  }

  if (
    message.role === "assistant" &&
    isLegacySurveyCreateGreetingText(displayedContent)
  ) {
    return null;
  }

  return {
    id: message.id || `msg-${index}-${Date.now()}`,
    role: message.role,
    displayedContent,
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
