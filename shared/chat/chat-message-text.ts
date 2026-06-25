type TextPart = { type: "text"; text: string };

type MessageLike = {
  content?: unknown;
  parts?: unknown;
};

function isTextPart(part: unknown): part is TextPart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    "text" in part &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

export function getMessageText(message: MessageLike | undefined) {
  if (!message) return "";

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts.filter(isTextPart).map((part) => part.text).join("").trim();
}
