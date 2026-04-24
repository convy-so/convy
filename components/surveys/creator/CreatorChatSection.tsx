"use client";

import {
  Send,
  Mic,
  Loader2,
  Sparkles,
  Play,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { getDisplayedMessageText } from "@/lib/surveys/message-normalizer";

interface CreatorChatSectionProps {
  messages: any[];
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
  t: (key: string) => string;
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
  t,
}: CreatorChatSectionProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((message, idx) => {
          const isUser = message.role === "user";
          const text = getDisplayedMessageText(message);
          
          if (!text && !message.parts?.some((p: any) => p.type === "tool-call")) return null;

          return (
            <div
              key={message.id || idx}
              className={cn(
                "flex flex-col max-w-[85%] lg:max-w-[75%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                isUser ? "ml-auto items-end" : "mr-auto items-start",
              )}
            >
              <div
                className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  isUser
                    ? "bg-gray-900 text-white rounded-tr-none"
                    : "bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-none",
                )}
              >
                {text ? (
                  <MarkdownMessage content={text} />
                ) : (
                  <div className="flex items-center gap-2 text-gray-400 italic">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processing...
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isResearching && (
          <div className="flex flex-col mr-auto items-start max-w-[85%] animate-pulse">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-tl-none flex items-center gap-3">
              <Sparkles className="w-4 h-4 animate-bounce" />
              <span className="text-sm font-medium">Researching educational best practices...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isReadOnly && (
        <div className="p-4 bg-white border-t border-gray-100">
          <form
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto relative group"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isVoiceMode
                  ? "Listening..."
                  : "Explain what you want to achieve..."
              }
              className={cn(
                "w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-4 pr-32 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-900 transition-all resize-none min-h-[60px] max-h-[200px]",
                isVoiceMode && "bg-indigo-50/50 border-indigo-200 ring-indigo-500/10",
              )}
              rows={1}
              disabled={isLoading || isInitializing}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreationVoiceMode(!isVoiceMode)}
                className={cn(
                  "p-2 rounded-xl transition-all duration-200",
                  isVoiceMode
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-110"
                    : "text-gray-400 hover:text-gray-900 hover:bg-gray-100",
                )}
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isLoading || isInitializing}
                className={cn(
                  "p-2 rounded-xl bg-black text-white transition-all duration-200 disabled:opacity-30",
                  input.trim() && !isLoading && "hover:bg-gray-800 scale-105 shadow-md",
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
          <div className="mt-2 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
