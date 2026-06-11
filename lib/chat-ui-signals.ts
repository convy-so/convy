import type { UIMessage } from "ai";

export const SURVEY_COMPLETION_TAG = "[[SURVEY_COMPLETED]]";

type UIMessagePart = UIMessage["parts"][number];
type ToolInvocationPart = UIMessagePart & {
  toolInvocation?: {
    toolName?: string;
    toolCallId?: string;
    result?: unknown;
  };
};
type ToolPartRecord = UIMessagePart & {
  toolName?: string;
  toolCallId?: string;
  state?: string;
  result?: unknown;
};

export function getUIMessageText(
  message: Pick<UIMessage, "parts"> | null | undefined,
) {
  return (
    message?.parts
      ?.filter(
        (part): part is Extract<UIMessagePart, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join(" ") ?? ""
  );
}

export function stripSurveyCompletionTag(text: string) {
  return text.replaceAll(SURVEY_COMPLETION_TAG, "").trim();
}

export function hasSurveyCompletionText(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes(SURVEY_COMPLETION_TAG.toLowerCase()) ||
    normalized.includes("thank you for completing") ||
    normalized.includes("survey is now complete")
  );
}

export function getToolNameFromUIPart(part: UIMessagePart): string | null {
  if (part.type === "tool-invocation") {
    const toolPart = part as ToolInvocationPart;
    return typeof toolPart.toolInvocation?.toolName === "string"
      ? toolPart.toolInvocation.toolName
      : null;
  }

  if (part.type === "dynamic-tool") {
    const toolPart = part as ToolPartRecord;
    return typeof toolPart.toolName === "string" ? toolPart.toolName : null;
  }

  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length) || null;
  }

  if (part.type === "tool-call" || part.type === "tool-result") {
    const toolPart = part as ToolPartRecord;
    return typeof toolPart.toolName === "string" ? toolPart.toolName : null;
  }

  return null;
}

export function isNamedToolUIPart(part: UIMessagePart, toolName: string) {
  return getToolNameFromUIPart(part) === toolName;
}
