"use client";

import { Bot, Loader2, Mic, MicOff } from "lucide-react";
import { UIMessage } from "ai";

import { SurveyMedia } from "@/shared/chat/chat-types";
import { toPersistedUIChatMessages, toUIMessage } from "@/shared/chat/chat-ui-messages";
import { isNamedToolUIPart } from "@/shared/chat/chat-ui-signals";
import { parseJsonValue } from "@/shared/http/json";
import { cn } from "@/shared/ui/tailwind-class-utils";

export type SampleReviewMessage = UIMessage & {
  media?: SurveyMedia;
  createdAt?: Date;
};

export type StoredSampleMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: unknown;
  timestamp?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isConversationRole(role: string): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

export function normalizeSampleMessage(
  message: StoredSampleMessage,
  index: number,
): SampleReviewMessage | null {
  const persistedMessage = toPersistedUIChatMessages(
    [
      {
        id: message.id || `hist-${index}-${Date.now()}`,
        role: message.role,
        content: message.content || "",
        parts: message.parts,
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
    ],
    ["user", "assistant"],
  )[0];
  const uiMessage = persistedMessage ? toUIMessage(persistedMessage) : null;

  if (!uiMessage) {
    return null;
  }

  return {
    ...uiMessage,
    createdAt: message.timestamp ? new Date(message.timestamp) : new Date(),
  };
}

export function isFinishSurveyPart(
  part: UIMessage["parts"][number],
): boolean {
  return isNamedToolUIPart(part, "finishSurvey");
}

function parseToolResult(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = parseJsonValue(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeSurveyMedia(value: unknown): SurveyMedia[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.type !== "string" ||
      typeof item.url !== "string"
    ) {
      return [];
    }

    if (item.type !== "image" && item.type !== "audio" && item.type !== "video") {
      return [];
    }

    return [
      {
        type: item.type,
        url: item.url,
        id:
          typeof item.id === "string"
            ? item.id
            : `media-${Math.random().toString(36).substring(2, 9)}`,
        description:
          typeof item.description === "string" ? item.description : undefined,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      },
    ];
  });
}

export function getMediaFromMessagePart(
  part: UIMessage["parts"][number],
): SurveyMedia | null {
  if (
    (part.type === "tool-invocation" || part.type === "tool-call") &&
    "toolName" in part &&
    part.toolName === "showMedia"
  ) {
    const result = parseToolResult("result" in part ? part.result : undefined);
    const media = result?.media;
    return normalizeSurveyMedia(media ? [media] : [])[0] ?? null;
  }

  return null;
}

export function VisualizerRing({
  isRecording,
  isAgentSpeaking,
  size = "normal",
  status,
}: {
  isRecording: boolean;
  isAgentSpeaking: boolean;
  size?: "normal" | "large";
  status: string;
}) {
  return (
    <div className="relative flex items-center justify-center">
      {isRecording || isAgentSpeaking ? (
        <>
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
              size === "large" ? "border-8" : "border-4",
              isAgentSpeaking ? "border-emerald-500/20" : "border-indigo-500/20",
            )}
          />
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
              size === "large" ? "border-8" : "border-4",
              isAgentSpeaking ? "border-emerald-500/10" : "border-indigo-500/10",
            )}
          />
        </>
      ) : null}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full border border-white/10 shadow-2xl backdrop-blur-sm transition-all duration-500",
          status === "error"
            ? "bg-red-500 shadow-red-500/50"
            : isAgentSpeaking
              ? "scale-110 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30"
              : isRecording
                ? "scale-110 bg-gradient-to-br from-indigo-600 to-violet-600 shadow-indigo-500/50"
                : "bg-gray-900 shadow-xl hover:scale-105",
          size === "large" ? "h-32 w-32" : "h-14 w-14",
        )}
      >
        {status === "error" ? (
          <Loader2
            className={cn(
              "animate-spin text-white",
              size === "large" ? "h-12 w-12" : "h-6 w-6",
            )}
          />
        ) : isAgentSpeaking ? (
          <Bot
            className={cn(
              "animate-pulse text-white",
              size === "large" ? "h-12 w-12" : "h-6 w-6",
            )}
          />
        ) : isRecording ? (
          <MicOff
            className={cn(
              "text-white",
              size === "large" ? "h-12 w-12" : "h-6 w-6",
            )}
          />
        ) : (
          <Mic
            className={cn(
              "text-white",
              size === "large" ? "h-12 w-12" : "h-6 w-6",
            )}
          />
        )}
      </div>
    </div>
  );
}
