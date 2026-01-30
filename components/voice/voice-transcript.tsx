"use client";

import { useEffect, useRef } from "react";
import { User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceTranscriptProps {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
  currentTranscript?: string;
  isRecording: boolean;
}

export function VoiceTranscript({
  messages,
  currentTranscript,
  isRecording,
}: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentTranscript]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Conversation
        </h3>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      >
        {messages.length === 0 && !currentTranscript && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 text-center">
              Your conversation will appear here
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
              message.role === "user" ? "flex-row-reverse" : ""
            )}
          >
            <div
              className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
                message.role === "assistant"
                  ? "bg-gray-900"
                  : "bg-gray-200"
              )}
            >
              {message.role === "assistant" ? (
                <Sparkles className="w-3 h-3 text-white" />
              ) : (
                <User className="w-3 h-3 text-gray-700" />
              )}
            </div>

            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 shadow-sm",
                message.role === "assistant"
                  ? "bg-white border border-gray-100 text-gray-800"
                  : "bg-gray-900 text-white"
              )}
            >
              <p className="text-sm leading-relaxed break-words">
                {message.content}
              </p>
            </div>
          </div>
        ))}

        {/* Live transcription while recording */}
        {isRecording && currentTranscript && (
          <div className="flex gap-2 flex-row-reverse animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-200">
              <User className="w-3 h-3 text-gray-700" />
            </div>
            <div className="max-w-[85%] rounded-xl px-3 py-2 bg-gray-100 border border-gray-200">
              <p className="text-sm leading-relaxed text-gray-600 italic">
                {currentTranscript}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
