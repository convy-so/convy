"use client";

import type { MutableRefObject } from "react";
import { Bot, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { MediaDisplay } from "@/features/surveys/ui/media-display";
import { MarkdownMessage } from "@/shared/ui/markdown-message";
import { cn } from "@/shared/ui/tailwind-class-utils";
import {
  getMediaFromMessagePart,
  type SampleReviewMessage,
} from "./sample-review-message-utils";

type Translate = ReturnType<typeof useTranslations>;

export function SampleReviewMessageList({
  messages,
  inputMode,
  isLoading,
  messagesEndRef,
  t,
}: {
  messages: SampleReviewMessage[];
  inputMode: "voice" | "text";
  isLoading: boolean;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  t: Translate;
}) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 scrollbar-thumb-gray-200 scrollbar-track-transparent md:px-8">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center space-y-6 py-20 text-center opacity-40">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
            <Bot className="h-8 w-8 text-gray-400" />
          </div>
          <div className="max-w-xs space-y-2">
            <p className="text-sm font-medium text-gray-900">
              Experience your survey
            </p>
            <p className="text-xs text-gray-500">
              {inputMode === "voice"
                ? "Speak naturally to the AI researcher to test the conversation flow."
                : "Type your responses below to see how the AI handles different scenarios."}
            </p>
          </div>
        </div>
      ) : null}

      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex max-w-[85%] flex-col gap-2",
            message.role === "user"
              ? "self-end items-end"
              : "self-start items-start",
          )}
        >
          <div
            className={cn(
              "rounded-2xl px-5 py-3 text-[15px] leading-relaxed shadow-sm",
              message.role === "assistant"
                ? "rounded-tl-sm border border-gray-100 bg-gray-50 text-gray-800"
                : "rounded-tr-sm bg-black text-white",
            )}
          >
            {message.parts?.map((part, index) => {
              if (part.type === "text") {
                return <MarkdownMessage key={index} content={part.text} />;
              }
              if (
                (part.type === "tool-invocation" || part.type === "tool-call") &&
                "toolName" in part
              ) {
                if (part.toolName === "showMedia") {
                  const media = getMediaFromMessagePart(part);
                  return media ? (
                    <MediaDisplay key={part.toolCallId || index} media={media} />
                  ) : null;
                }
                if (part.toolName === "finishSurvey") {
                  return (
                    <div
                      key={part.toolCallId || index}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t("Toasts.Finished")}
                      </div>
                      <p className="pl-1 text-[11px] italic text-gray-500">
                        You can now provide feedback in the sidebar to refine future simulations.
                      </p>
                    </div>
                  );
                }
              }
              return null;
            })}
          </div>
        </div>
      ))}

      {isLoading ? (
        <div className="self-start">
          <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 px-4 py-3">
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
      ) : null}
      <div ref={messagesEndRef} className="h-2" />
    </div>
  );
}
