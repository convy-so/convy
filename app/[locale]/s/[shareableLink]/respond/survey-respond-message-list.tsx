"use client";

import type { MutableRefObject } from "react";
import type { UIMessage } from "ai";
import { Sparkles, User } from "lucide-react";

import { MediaDisplay } from "@/features/surveys/ui/media-display";
import { MarkdownMessage } from "@/shared/ui/markdown-message";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { stripSurveyCompletionTag } from "@/shared/chat/chat-ui-signals";
import { getMediaFromPart } from "./survey-respond-models";

export function SurveyRespondMessageList({
  messages,
  messagesEndRef,
}: {
  messages: UIMessage[];
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {messages
        .filter((message) => message.id !== "init_ping_hidden")
        .map((message) => {
          const messageParts = message.parts ?? [];

          return (
            <div
              key={message.id}
              className={cn(
                "flex gap-4 max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2",
                message.role === "user" ? "flex-row-reverse" : "",
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border",
                  message.role === "assistant"
                    ? "bg-white border-gray-200"
                    : "bg-black border-transparent",
                )}
              >
                {message.role === "assistant" ? (
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-6 py-4 border text-[1.05rem] leading-relaxed",
                  message.role === "assistant"
                    ? "bg-white text-gray-800 border-gray-200"
                    : "bg-zinc-900 text-gray-100 border-transparent",
                )}
              >
                <div className="whitespace-pre-wrap">
                  {messageParts.length > 0
                    ? messageParts.map((part, index) =>
                        part.type === "text" ? (
                          <MarkdownMessage
                            key={index}
                            content={stripSurveyCompletionTag(part.text)}
                          />
                        ) : null,
                      )
                    : null}

                  {messageParts.map((part, index) => {
                    const media = getMediaFromPart(part);
                    return media ? (
                      <MediaDisplay
                        key={`media-${message.id}-${index}`}
                        media={media}
                      />
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          );
        })}
      <div ref={messagesEndRef} className="h-4" />
    </div>
  );
}
