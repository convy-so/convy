/* eslint-disable @next/next/no-img-element */

import { ExternalLink, Image as ImageIcon, PlayCircle } from "lucide-react";
import type { UIMessage } from "ai";

export type ToolPayloadRecord = Record<string, unknown>;

export type LiveToolPart = {
  kind: "tool";
  toolName: string;
  toolCallId: string | null;
  input: ToolPayloadRecord | undefined;
  output: unknown;
  isResolved: boolean;
};

export type LiveTextPart = {
  kind: "text";
  text: string;
};

export type LiveMessagePart = LiveTextPart | LiveToolPart;

export type LiveMessage = {
  id: string;
  role: UIMessage["role"];
  metadata: ToolPayloadRecord;
  createdAt?: string | Date;
  parts: LiveMessagePart[];
};

export type LiveMessageSource = {
  id: string;
  role: UIMessage["role"];
  parts?: unknown[];
  annotations?: Array<{ type: string; data?: unknown }>;
  metadata?: unknown;
  content?: string;
  createdAt?: string | Date;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isToolPayloadRecord(
  value: unknown,
): value is ToolPayloadRecord {
  return typeof value === "object" && value !== null;
}

function getOptionalString(record: ToolPayloadRecord, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function getOptionalRecord(
  record: ToolPayloadRecord,
  key: string,
): ToolPayloadRecord | undefined {
  const value = record[key];
  return isToolPayloadRecord(value) ? value : undefined;
}

function isTextMessagePart(part: unknown): part is { type: "text"; text: string } {
  return (
    isToolPayloadRecord(part) &&
    part.type === "text" &&
    typeof part.text === "string"
  );
}

function getMetadataFromMessage(message: LiveMessageSource): ToolPayloadRecord {
  if (isToolPayloadRecord(message.metadata)) {
    return message.metadata;
  }

  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  const metadataAnnotation = annotations.find(
    (annotation) =>
      isToolPayloadRecord(annotation) &&
      annotation.type === "metadata" &&
      isToolPayloadRecord(annotation.data),
  );

  return isToolPayloadRecord(metadataAnnotation?.data)
    ? metadataAnnotation.data
    : {};
}

function getLegacyMessageText(message: LiveMessageSource): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  return "";
}

function normalizeToolPart(part: unknown): LiveToolPart | null {
  if (!isToolPayloadRecord(part) || typeof part.type !== "string") {
    return null;
  }

  if (part.type === "dynamic-tool") {
    return {
      kind: "tool",
      toolName: getOptionalString(part, "toolName") ?? "",
      toolCallId: getOptionalString(part, "toolCallId"),
      input: getOptionalRecord(part, "input") ?? getOptionalRecord(part, "args"),
      output: part.output,
      isResolved: part.state === "output-available" || part.output !== undefined,
    };
  }

  if (part.type === "tool-invocation") {
    const toolInvocation = getOptionalRecord(part, "toolInvocation");
    if (!toolInvocation) {
      return null;
    }

    return {
      kind: "tool",
      toolName: getOptionalString(toolInvocation, "toolName") ?? "",
      toolCallId: getOptionalString(toolInvocation, "toolCallId"),
      input: getOptionalRecord(toolInvocation, "args"),
      output: toolInvocation.result,
      isResolved: toolInvocation.result !== undefined,
    };
  }

  if (part.type === "tool-call" || part.type === "tool-result" || part.type.startsWith("tool-")) {
    return {
      kind: "tool",
      toolName:
        getOptionalString(part, "toolName") ??
        (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : ""),
      toolCallId: getOptionalString(part, "toolCallId"),
      input: getOptionalRecord(part, "input") ?? getOptionalRecord(part, "args"),
      output: part.output ?? part.result,
      isResolved:
        part.type === "tool-result" ||
        part.state === "output-available" ||
        part.output !== undefined ||
        part.result !== undefined,
    };
  }

  return null;
}

function normalizeLiveMessageParts(message: LiveMessageSource): LiveMessagePart[] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const normalizedParts = parts.flatMap((part): LiveMessagePart[] => {
    if (isTextMessagePart(part)) {
      return part.text.trim().length > 0 ? [{ kind: "text", text: part.text }] : [];
    }

    const toolPart = normalizeToolPart(part);
    return toolPart ? [toolPart] : [];
  });

  if (normalizedParts.length > 0) {
    return normalizedParts;
  }

  const fallbackText = getLegacyMessageText(message).trim();
  return fallbackText ? [{ kind: "text", text: fallbackText }] : [];
}

export function normalizeLiveMessage(message: LiveMessageSource): LiveMessage {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    parts: normalizeLiveMessageParts(message),
    metadata: getMetadataFromMessage(message),
  };
}

export function getToolPayload(
  args: ToolPayloadRecord | undefined,
  output: unknown,
) {
  return isToolPayloadRecord(output) ? output : args ?? {};
}

export function hasSuccessfulFinishSession(messages: LiveMessage[]) {
  return messages.some((message) =>
    message.parts.some(
      (part) =>
        part.kind === "tool" &&
        part.toolName === "finish_session" &&
        isToolPayloadRecord(part.output) &&
        part.output.success === true,
    ),
  );
}

export function MediaResultCard({
  mediaType,
  result,
}: {
  mediaType: "image" | "video";
  result: ToolPayloadRecord;
}) {
  const title =
    textValue(result.title) || (mediaType === "image" ? "Image" : "Video");
  const sourceLabel = textValue(result.sourceLabel) || textValue(result.provider);
  const sourceUrl =
    textValue(result.sourceUrl) ||
    textValue(result.watchUrl) ||
    textValue(result.url);
  const reason = textValue(result.reason);
  const imageUrl = mediaType === "image" ? textValue(result.url) : "";
  const videoUrl =
    mediaType === "video"
      ? textValue(result.watchUrl) || textValue(result.url)
      : "";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
          {mediaType === "image" && imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : mediaType === "video" ? (
            <PlayCircle className="h-6 w-6" />
          ) : (
            <ImageIcon className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-slate-900">
            {title}
          </p>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <span className="truncate">{sourceLabel || "Open source"}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : null}
          {reason ? (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
              {reason}
            </p>
          ) : null}
          {mediaType === "video" && videoUrl ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Watch
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function appendTranscript(currentValue: string, transcript: string) {
  const trimmedCurrent = currentValue.trim();
  return trimmedCurrent ? `${trimmedCurrent} ${transcript}`.trim() : transcript;
}
