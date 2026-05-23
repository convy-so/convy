import { type AllowedRole, type ChatMessage, type ChatMessagePart } from "@/lib/chat-types";
import { type UIMessage } from "ai";

type UIPart = UIMessage["parts"][number];
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isAllowedRole(value: unknown): value is AllowedRole {
  return value === "user" || value === "assistant" || value === "tool" || value === "system";
}

function parseChatMessagePart(part: unknown): ChatMessagePart | null {
  if (!isRecord(part) || typeof part.type !== "string") {
    return null;
  }

  switch (part.type) {
    case "text":
      return typeof part.text === "string"
        ? { type: "text", text: part.text }
        : null;
    case "image":
      return typeof part.image === "string"
        ? {
            type: "image",
            image: part.image,
            mimeType: typeof part.mimeType === "string" ? part.mimeType : undefined,
          }
        : null;
    case "file":
      if (typeof part.url !== "string" || typeof part.mediaType !== "string") {
        return null;
      }

      if (part.mediaType.startsWith("image/")) {
        return {
          type: "image",
          image: part.url,
          mimeType: part.mediaType,
        };
      }

      return {
        type: "file",
        file: part.url,
        mimeType: part.mediaType,
      };
    case "tool-call":
      return typeof part.toolCallId === "string" && typeof part.toolName === "string"
        ? {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          }
        : null;
    case "tool-result":
      return typeof part.toolCallId === "string" && typeof part.toolName === "string"
        ? {
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
          }
        : null;
    case "dynamic-tool":
      if (typeof part.toolCallId !== "string" || typeof part.toolName !== "string") {
        return null;
      }

      if (part.state === "input-available") {
        return {
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        };
      }

      if (part.state === "output-available") {
        return {
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.output,
        };
      }

      return null;
    default:
      return null;
  }
}

function toUIPart(part: ChatMessagePart): UIPart {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return {
        type: "file",
        mediaType: part.mimeType ?? "image/*",
        url: part.image,
      };
    case "file":
      return {
        type: "file",
        mediaType: part.mimeType,
        url: part.file,
      };
    case "tool-call":
      return {
        type: "dynamic-tool",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: "input-available",
        input: part.input,
      };
    case "tool-result":
      return {
        type: "dynamic-tool",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: "output-available",
        input: {},
        output: part.result,
      };
  }
}

export function extractMessageText(message: Partial<ChatMessage> | null | undefined): string {
  if (typeof message?.content === "string") {
    return message.content;
  }

  if (Array.isArray(message?.parts)) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

export function toPersistedUIChatMessages(
  messages: readonly unknown[],
  allowedRoles: AllowedRole[] = ["user", "assistant"],
): ChatMessage[] {
  return (Array.isArray(messages) ? messages : [])
    .flatMap((message) => {
      if (!isRecord(message) || typeof message.id !== "string" || !isAllowedRole(message.role)) {
        return [];
      }

      if (!allowedRoles.includes(message.role)) {
        return [];
      }

      const parsedParts = Array.isArray(message.parts)
        ? message.parts
            .map(parseChatMessagePart)
            .filter((part): part is ChatMessagePart => part !== null)
        : [];

      const messageWithAttachments = message as { experimental_attachments?: unknown };
      const attachmentParts = Array.isArray(messageWithAttachments.experimental_attachments)
        ? messageWithAttachments.experimental_attachments.map((att: unknown) => {
            if (typeof att === "object" && att !== null) {
              const attObj = att as { url?: string; contentType?: string };
              if (typeof attObj.url === "string") {
                return {
                  type: "image" as const,
                  image: attObj.url,
                  mimeType: typeof attObj.contentType === "string" ? attObj.contentType : undefined,
                };
              }
            }
            return null;
          }).filter((part): part is NonNullable<typeof part> => part !== null)
        : [];

      const parts = [...parsedParts, ...attachmentParts];

      return [{
        id: message.id,
        role: message.role,
        content: extractMessageText({
          content: typeof message.content === "string" ? message.content : undefined,
          parts,
        }),
        parts: parts.length > 0 ? parts : undefined,
        timestamp:
          typeof message.timestamp === "string"
            ? message.timestamp
            : new Date().toISOString(),
      }];
    });
}

export function toVisibleConversationMessages(
  messages: ChatMessage[],
): Array<ChatMessage & { role: "user" | "assistant" }> {
  return messages.filter(
    (
      message,
    ): message is ChatMessage & { role: "user" | "assistant" } =>
      message.role === "user" || message.role === "assistant",
  );
}

export function toUIMessages(
  messages: ChatMessage[],
): UIMessage[] {
  return messages
    .filter((message) => message.role !== "tool")
    .map((message): UIMessage => {
      const fallbackParts: ChatMessagePart[] = [{ type: "text", text: message.content }];
      const parts =
        Array.isArray(message.parts) && message.parts.length > 0
          ? message.parts
          : fallbackParts;

      return {
        id: message.id,
        role:
          message.role === "system"
            ? "system"
            : message.role === "user"
              ? "user"
              : "assistant",
        parts: parts.map(toUIPart),
      };
    });
}
