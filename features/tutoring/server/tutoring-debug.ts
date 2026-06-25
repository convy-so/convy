type DebugValue = unknown;

type TimedStepPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

function nowMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number) {
  return Math.round(nowMs() - startedAt);
}

export function summarizeTutoringText(value: DebugValue, maxLength = 220) {
  if (typeof value !== "string") return value;
  return trimText(value, maxLength);
}

export function summarizeTutoringMessages(messages: DebugValue): unknown {
  if (!Array.isArray(messages)) return messages;

  return messages.map((message: unknown) => {
    if (!isRecord(message)) return message;
    const content =
      typeof message.content === "string"
        ? summarizeTutoringText(message.content, 120)
        : undefined;
    const text =
      typeof message.text === "string"
        ? summarizeTutoringText(message.text, 120)
        : undefined;

    return {
      id: typeof message.id === "string" ? message.id : undefined,
      role: typeof message.role === "string" ? message.role : undefined,
      content,
      text,
      parts: Array.isArray(message.parts) ? message.parts.length : undefined,
      metadata:
        isRecord(message.metadata)
          ? Object.keys(message.metadata)
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

export async function measureTutoringStep<T>(
  event: string,
  payload: TimedStepPayload,
  step: () => Promise<T> | T,
) {
  const startedAt = nowMs();
  logTutoringDebug(`${event}:start`, payload);

  try {
    const result = await step();
    logTutoringDebug(`${event}:done`, {
      ...payload,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  } catch (error) {
    logTutoringError(`${event}:error`, error, {
      ...payload,
      durationMs: elapsedMs(startedAt),
    });
    throw error;
  }
}

export function createTutoringTimer() {
  const startedAt = nowMs();

  return {
    elapsedMs: () => elapsedMs(startedAt),
  };
}
