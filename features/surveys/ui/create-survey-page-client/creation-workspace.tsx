"use client";

import type { FormEvent, KeyboardEvent, MutableRefObject } from "react";
import type { ComponentProps } from "react";
import { Loader2, Play } from "lucide-react";

import { CreatorChatSection } from "@/features/surveys/ui/creator-chat-section";
import { cn } from "@/shared/ui/tailwind-class-utils";

type ChatProps = ComponentProps<typeof CreatorChatSection>;

export function CreationWorkspace({
  isConversationLocked,
  isReadyForSample,
  isFinalizing,
  messages,
  isLoading,
  isResearching,
  isInitializing,
  isVoiceMode,
  input,
  setInput,
  handleSubmit,
  handleKeyDown,
  setCreationVoiceMode,
  messagesEndRef,
  handleGoToSampleConversations,
}: {
  isConversationLocked: boolean;
  isReadyForSample: boolean;
  isFinalizing: boolean;
  messages: ChatProps["messages"];
  isLoading: boolean;
  isResearching: boolean;
  isInitializing: boolean;
  isVoiceMode: boolean;
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (event: FormEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  setCreationVoiceMode: (enabled: boolean) => void;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  handleGoToSampleConversations: () => void;
}) {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pb-4 sm:px-6 lg:px-8">
        <div className="border-b border-slate-200 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            Survey creation
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Build the brief in conversation.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Keep the page quiet. The transcript is the primary workspace.
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <CreatorChatSection
            messages={messages}
            isLoading={isLoading}
            isResearching={isResearching}
            isInitializing={isInitializing}
            isReadOnly={isConversationLocked}
            isVoiceMode={isVoiceMode}
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            handleKeyDown={handleKeyDown}
            setCreationVoiceMode={setCreationVoiceMode}
            messagesEndRef={messagesEndRef}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 py-4">
          <p className="text-sm text-slate-500">
            Generate sample conversations when the brief is complete.
          </p>
          <button
            onClick={handleGoToSampleConversations}
            disabled={!isReadyForSample || isFinalizing}
            className={cn(
              "inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium transition",
              !isReadyForSample || isFinalizing
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
            )}
          >
            {isFinalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Generate Sample Conversations
          </button>
        </div>
      </div>
    </div>
  );
}
