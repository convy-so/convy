import type { UIMessage } from "ai";

import type {
  ChatMessage,
  SurveyMedia,
} from "@/shared/chat/chat-types";
import { toPersistedUIChatMessages } from "@/shared/chat/chat-ui-messages";
import { readJsonResponseValue } from "@/shared/http/json";

export interface Survey {
  id: string;
  title: string;
  objective?: { description?: string };
  targetAudience?: { description?: string };
  tone?: string;
  isVoice?: boolean;
  media?: SurveyMedia[];
  language?: "en" | "fr" | "de";
}

export interface SurveyInitResponse {
  survey: Survey;
  conversationId: string;
  participantId: string;
  messages?: ChatMessage[];
  completed?: boolean;
}

export type SurveyResponseLocale = "en" | "fr" | "de";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSurveyLanguage(value: unknown): Survey["language"] | undefined {
  return value === "en" || value === "fr" || value === "de"
    ? value
    : undefined;
}

function parseSurveyMediaType(value: unknown): SurveyMedia["type"] | null {
  return value === "image" || value === "video" || value === "audio"
    ? value
    : null;
}

function parseSurveyMedia(value: unknown): SurveyMedia | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = parseSurveyMediaType(value.type);
  if (!type || typeof value.url !== "string") {
    return null;
  }

  return {
    type,
    url: value.url,
    description:
      typeof value.description === "string" ? value.description : undefined,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
    altText: typeof value.altText === "string" ? value.altText : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : null,
    id: typeof value.id === "string" ? value.id : undefined,
    storageBucket:
      typeof value.storageBucket === "string" ? value.storageBucket : undefined,
    storagePath:
      typeof value.storagePath === "string" ? value.storagePath : undefined,
    requiresSignedAccess:
      typeof value.requiresSignedAccess === "boolean"
        ? value.requiresSignedAccess
        : undefined,
    contextForUse:
      typeof value.contextForUse === "string" ? value.contextForUse : undefined,
  };
}

function parseOptionalDescription(
  value: unknown,
): { description?: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.description === "string"
    ? { description: value.description }
    : undefined;
}

function parseSurvey(value: unknown): Survey | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    objective: parseOptionalDescription(value.objective),
    targetAudience: parseOptionalDescription(value.targetAudience),
    tone: typeof value.tone === "string" ? value.tone : undefined,
    isVoice: typeof value.isVoice === "boolean" ? value.isVoice : undefined,
    media: Array.isArray(value.media)
      ? value.media
          .map(parseSurveyMedia)
          .filter((media): media is SurveyMedia => media !== null)
      : undefined,
    language: parseSurveyLanguage(value.language),
  };
}

function normalizeRawSurveyMessages(value: unknown): ChatMessage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalizedMessages = value.flatMap((message, index) => {
    if (!isRecord(message)) {
      return [];
    }

    const normalizedMessage: Record<string, unknown> = {
      ...message,
      id: typeof message.id === "string" ? message.id : `msg-${index}`,
    };

    if (
      !Array.isArray(message.parts) &&
      Array.isArray(message.content)
    ) {
      normalizedMessage.parts = message.content;
    }

    return [normalizedMessage];
  });

  return toPersistedUIChatMessages(normalizedMessages, ["user", "assistant"]).map(
    (message) =>
      message.parts?.length || !message.content
        ? message
        : {
            ...message,
            parts: [{ type: "text", text: message.content }],
          },
  );
}

function parseErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return undefined;
}

function parseSurveyInitResponse(payload: unknown): SurveyInitResponse | null {
  if (!isRecord(payload)) {
    return null;
  }

  const survey = parseSurvey(payload.survey);
  if (
    !survey ||
    typeof payload.conversationId !== "string" ||
    typeof payload.participantId !== "string"
  ) {
    return null;
  }

  return {
    survey,
    conversationId: payload.conversationId,
    participantId: payload.participantId,
    messages: normalizeRawSurveyMessages(payload.messages),
    completed: typeof payload.completed === "boolean" ? payload.completed : undefined,
  };
}

export function getDefaultMimeType(mediaType: SurveyMedia["type"]): string {
  switch (mediaType) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "audio":
      return "audio/*";
  }
}

export function getMediaFromPart(
  part: UIMessage["parts"][number],
): SurveyMedia | null {
  if (part.type !== "file") {
    return null;
  }

  if (part.mediaType.startsWith("image/")) {
    return { type: "image", url: part.url, mimeType: part.mediaType };
  }

  if (part.mediaType.startsWith("video/")) {
    return { type: "video", url: part.url, mimeType: part.mediaType };
  }

  if (part.mediaType.startsWith("audio/")) {
    return { type: "audio", url: part.url, mimeType: part.mediaType };
  }

  return null;
}

export function getVoiceFallbackMessage(error: unknown): string {
  const detail =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (
    detail &&
    detail !== "[object Event]" &&
    detail !== "null" &&
    detail.length <= 120
  ) {
    return `Voice ran into a problem (${detail}). You can continue in text below and retry voice later.`;
  }

  return "Voice ran into a problem, so we switched you to text. You can continue below and retry voice later.";
}

export async function initializeSurvey(
  shareableLink: string,
  resumeToken?: string | null,
): Promise<SurveyInitResponse> {
  const url = resumeToken
    ? `/api/surveys/respond/${shareableLink}?resume=${encodeURIComponent(resumeToken)}`
    : `/api/surveys/respond/${shareableLink}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Survey not found");
    }
    if (response.status === 403) {
      const data = await readJsonResponseValue(response);
      throw new Error(
        parseErrorMessage(data) ?? "This survey is no longer accepting responses",
      );
    }
    throw new Error("Failed to load survey");
  }

  const payload = await readJsonResponseValue(response);
  const parsedResponse = parseSurveyInitResponse(payload);

  if (!parsedResponse) {
    throw new Error("Failed to load survey");
  }

  return parsedResponse;
}

export function getUpdatedQuery(
  search: string,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams(search);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return Object.fromEntries(params.entries());
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("input");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
