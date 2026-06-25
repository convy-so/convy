"use client";

import { Loader2, Mic, Send } from "lucide-react";
import type { UIMessage } from "ai";

import { MarkdownMessage } from "@/shared/ui/markdown-message";
import { cn } from "@/shared/ui/tailwind-class-utils";
import {
  getDisplayedMessageText,
  isInternalSurveyCreateMessageText,
} from "@/features/surveys/server/message-normalizer";

interface CreatorChatSectionProps {
  messages: UIMessage[];
  isLoading: boolean;
  isResearching: boolean;
  isInitializing: boolean;
  isReadOnly: boolean;
  isVoiceMode: boolean;
  input: string;
  setInput: (val: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  setCreationVoiceMode: (enabled: boolean) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function CreatorChatSection({
  messages,
  isLoading,
  isResearching,
  isInitializing,
  isReadOnly,
  isVoiceMode,
  input,
  setInput,
  handleSubmit,
  handleKeyDown,
  setCreationVoiceMode,
  messagesEndRef,
}: CreatorChatSectionProps) {
  const visibleMessages = messages.filter((message) => {
    const text = getDisplayedMessageText(message);
    return !isInternalSurveyCreateMessageText(text);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto border-t border-slate-200">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
          {visibleMessages.length === 0 ? (
            <div className="py-12 text-sm text-slate-500">
              Describe the survey objective, audience, and constraints to begin.
            </div>
          ) : (
            <div className="space-y-6">
              {visibleMessages.map((message, idx) => {
                const isUser = message.role === "user";
                const text = getDisplayedMessageText(message);

                if (!text && !message.parts?.some((part) => part.type === "tool-call")) {
                  return null;
                }

                return (
                  <div
                    key={message.id || idx}
                    className={cn("flex", isUser ? "justify-end" : "justify-start")}
                  >
                    <div className="max-w-[46rem] min-w-0">
                      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {isUser ? "You" : "Assistant"}
                      </p>
                      <div
                        className={cn(
                          "border px-4 py-3 text-sm leading-7 text-slate-900",
                          isUser ? "border-slate-900 bg-white" : "border-slate-200 bg-slate-50",
                        )}
                      >
                        {text ? (
                          <MarkdownMessage
                            content={text}
                            className={
                              isUser
                                ? "[&_a]:text-slate-900 [&_blockquote]:border-slate-300 [&_blockquote]:bg-transparent [&_blockquote]:text-slate-900 [&_code]:border-slate-300 [&_code]:bg-slate-100 [&_code]:text-slate-900 [&_em]:!text-slate-900 [&_h1]:!text-slate-950 [&_h2]:!text-slate-950 [&_h3]:!text-slate-950 [&_li]:text-slate-900 [&_ol]:!text-slate-900 [&_p]:!text-slate-900 [&_strong]:!text-slate-950 [&_table]:text-slate-900 [&_tbody]:!text-slate-900 [&_td]:!text-slate-900 [&_thead]:!text-slate-900 [&_tr]:!text-slate-900 [&_ul]:!text-slate-900"
                                : undefined
                            }
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Processing...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isResearching ? (
                <div className="flex justify-start">
                  <div className="max-w-[46rem] min-w-0">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Assistant
                    </p>
                    <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-500">
                      Researching educational best practices...
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {isReadOnly ? null : (
        <div className="border-t border-slate-200">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isVoiceMode ? "Listening..." : "Type your next instruction..."}
                className="min-h-[96px] w-full resize-none border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition focus:border-slate-950"
                rows={3}
                disabled={isLoading || isInitializing}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setCreationVoiceMode(!isVoiceMode)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 border px-3 text-sm transition",
                      isVoiceMode
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-950",
                    )}
                  >
                    <Mic className="h-4 w-4" />
                    {isVoiceMode ? "Voice on" : "Voice"}
                  </button>
                  <span>Enter sends. Shift+Enter adds a new line.</span>
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || isInitializing}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium transition",
                    !input.trim() || isLoading || isInitializing
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
