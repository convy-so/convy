type DebugValue = unknown;

function isDebugEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_TUTORING_DEBUG === "1"
  );
}

function trimText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function summarizeTutoringText(value: DebugValue, maxLength = 220) {
  if (typeof value !== "string") return value;
  return trimText(value, maxLength);
}

export function summarizeTutoringMessages(messages: DebugValue) {
  if (!Array.isArray(messages)) return messages;

  return messages.map((message) => {
    if (typeof message !== "object" || message === null) return message;
    const record = message as Record<string, unknown>;
    const content =
      typeof record.content === "string"
        ? summarizeTutoringText(record.content, 120)
        : undefined;
    const text =
      typeof record.text === "string"
        ? summarizeTutoringText(record.text, 120)
        : undefined;

    return {
      id: typeof record.id === "string" ? record.id : undefined,
      role: typeof record.role === "string" ? record.role : undefined,
      content,
      text,
      parts: Array.isArray(record.parts) ? record.parts.length : undefined,
      metadata:
        record.metadata && typeof record.metadata === "object"
          ? Object.keys(record.metadata as Record<string, unknown>)
          : undefined,
    };
  });
}

export function logTutoringDebug(event: string, payload: Record<string, unknown>) {
  if (!isDebugEnabled()) return;
  console.log(`[tutoring] ${event}`, payload);
}

export function logTutoringWarn(event: string, payload: Record<string, unknown>) {
  if (!isDebugEnabled()) return;
  console.warn(`[tutoring] ${event}`, payload);
}

export function logTutoringError(event: string, error: unknown, payload?: Record<string, unknown>) {
  if (!isDebugEnabled()) return;
  console.error(`[tutoring] ${event}`, {
    ...(payload ?? {}),
    error,
  });
}
