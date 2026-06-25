"use client";

import type { MutableRefObject } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/ui/tailwind-class-utils";
import { useVoiceWebSocket } from "@/features/surveys/client/hooks/use-voice-websocket";

type Translate = ReturnType<typeof useTranslations>;
type VoiceSocketState = ReturnType<typeof useVoiceWebSocket>;

export const VisualizerRing = ({
  isRecording,
  isAgentSpeaking,
  size = "normal",
  status = "idle",
}: {
  isRecording: boolean;
  isAgentSpeaking: boolean;
  size?: "normal" | "large";
  status?: string;
}) => (
  <div className="relative flex items-center justify-center">
    {isRecording || isAgentSpeaking ? (
      <>
        <div
          className={cn(
            "absolute inset-0 rounded-full border-4 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
            size === "large" ? "border-8" : "border-4",
            isAgentSpeaking ? "border-emerald-500/20" : "border-indigo-500/20",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 rounded-full border-4 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
            size === "large" ? "border-8" : "border-4",
            isAgentSpeaking ? "border-emerald-500/10" : "border-indigo-500/10",
          )}
        />
      </>
    ) : null}
    <div
      className={cn(
        "relative z-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl backdrop-blur-sm border border-white/10",
        status === "error"
          ? "bg-red-500 shadow-red-500/50"
          : isAgentSpeaking
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 scale-110 shadow-emerald-500/30"
            : isRecording
              ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/30"
              : "bg-gray-900 shadow-md hover:scale-105",
        size === "large" ? "w-32 h-32" : "w-20 h-20",
      )}
    >
      {status === "error" ? (
        <AlertCircle
          className={cn("text-white", size === "large" ? "w-12 h-12" : "w-8 h-8")}
        />
      ) : isAgentSpeaking ? (
        <Sparkles
          className={cn(
            "text-white animate-pulse",
            size === "large" ? "w-12 h-12" : "w-8 h-8",
          )}
        />
      ) : isRecording ? (
        <MicOff
          className={cn("text-white", size === "large" ? "w-12 h-12" : "w-8 h-8")}
        />
      ) : (
        <Mic
          className={cn("text-white", size === "large" ? "w-12 h-12" : "w-8 h-8")}
        />
      )}
    </div>
  </div>
);

export function SurveyRespondInputPanel({
  isVoiceMode,
  voiceSocket,
  input,
  setInput,
  inputRef,
  isChatLoading,
  hasStarted,
  voiceFallbackNotice,
  onRetryVoice,
  onSubmit,
  translations,
}: {
  isVoiceMode: boolean;
  voiceSocket: VoiceSocketState;
  input: string;
  setInput: (value: string) => void;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  isChatLoading: boolean;
  hasStarted: boolean;
  voiceFallbackNotice: string | null;
  onRetryVoice: () => void;
  onSubmit: (event?: FormEvent) => Promise<void>;
  translations: Translate;
}) {
  return (
    <div className="bg-white border-t border-gray-100 p-4 z-20 flex-shrink-0">
      <div className="max-w-3xl mx-auto">
        {isVoiceMode ? (
          <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-4 duration-500">
            <button
              onClick={() => {
                if (voiceSocket.status === "error" || voiceSocket.status === "disconnected") {
                  onRetryVoice();
                  return;
                }
                if (voiceSocket.isRecording) {
                  voiceSocket.stopRecording();
                } else {
                  void voiceSocket.startRecording();
                }
              }}
              disabled={voiceSocket.status === "connecting"}
              className="group focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <VisualizerRing
                isRecording={voiceSocket.isRecording}
                isAgentSpeaking={voiceSocket.isPlaying}
                size={voiceSocket.status === "error" ? "large" : "normal"}
                status={voiceSocket.status}
              />
            </button>

            <div className="text-center space-y-2 w-full max-w-lg">
              <p className="text-gray-900 font-semibold text-lg tracking-tight">
                {voiceSocket.status === "error" ? (
                  <span className="text-red-600">
                    {translations("connectionFailed")}
                  </span>
                ) : voiceSocket.status === "connecting" ? (
                  translations("connecting")
                ) : voiceSocket.isRecording ? (
                  translations("listening")
                ) : voiceSocket.isPlaying ? (
                  translations("aiSpeaking")
                ) : (
                  translations("tapToSpeak")
                )}
              </p>

              {voiceSocket.status === "error" ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="px-4 py-2 text-sm font-medium text-red-500 bg-red-50 rounded-lg border border-red-100">
                    {voiceSocket.error || translations("connectionFailed")}
                  </p>
                  <button
                    onClick={() => {
                      onRetryVoice();
                    }}
                    className="text-xs text-gray-500 underline hover:text-gray-800"
                  >
                    {translations("tapToRetry")}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                  {voiceSocket.status === "connected"
                    ? translations("aiReady")
                    : translations("initializing")}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {voiceFallbackNotice ? (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{voiceFallbackNotice}</p>
              </div>
            ) : null}
            <form onSubmit={(event) => void onSubmit(event)} className="relative group">
              <div className="relative bg-white border border-gray-200 rounded-2xl group-focus-within:border-gray-400 transition-all flex items-end overflow-hidden">
                <div className="p-3 mb-1 ml-1 text-gray-300">
                  <Paperclip className="w-5 h-5 opacity-50" />
                </div>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void onSubmit(event);
                    }
                  }}
                  placeholder={translations("typeAnswer")}
                  rows={1}
                  disabled={!hasStarted || isChatLoading}
                  className="flex-1 py-4 px-4 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[60px] sm:min-h-[96px] max-h-60 disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <div className="p-2 mb-1 mr-1">
                  <button
                    type="submit"
                    disabled={!hasStarted || !input.trim() || isChatLoading}
                    className={cn(
                      "p-2.5 rounded-xl transition-all",
                      input.trim() && !isChatLoading
                        ? "bg-black text-white hover:bg-gray-800 hover:-translate-y-0.5"
                        : "bg-gray-100 text-gray-300 cursor-not-allowed",
                    )}
                  >
                    {isChatLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
