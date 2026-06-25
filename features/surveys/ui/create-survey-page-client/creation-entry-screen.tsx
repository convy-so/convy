"use client";

import { Mic, Play, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/ui/tailwind-class-utils";

type Translate = ReturnType<typeof useTranslations>;

export function CreationEntryScreen({
  isVoiceMode,
  setCreationVoiceMode,
  handleStart,
  translations,
}: {
  isVoiceMode: boolean;
  setCreationVoiceMode: (enabled: boolean) => void;
  handleStart: () => void;
  translations: Translate;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="space-y-8 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
            {translations("Title.ChooseTopic")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500">
            {translations("Subtitle")}
          </p>

          <div className="mx-auto max-w-2xl space-y-6">
            <div className="grid grid-cols-1 gap-px border-y border-slate-200 sm:grid-cols-2">
              {[
                {
                  active: !isVoiceMode,
                  icon: <Send className="h-4 w-4" />,
                  label: translations("CreationMode.Text"),
                  description: translations("CreationMode.TextDescription"),
                  onClick: () => setCreationVoiceMode(false),
                },
                {
                  active: isVoiceMode,
                  icon: <Mic className="h-4 w-4" />,
                  label: translations("CreationMode.Voice"),
                  description: translations("CreationMode.VoiceDescription"),
                  onClick: () => setCreationVoiceMode(true),
                },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={option.onClick}
                  className={cn(
                    "flex items-start gap-3 border-x border-slate-200 bg-white px-4 py-4 text-left transition",
                    option.active
                      ? "text-slate-950"
                      : "text-slate-500 hover:text-slate-950",
                  )}
                >
                  <span className="mt-0.5">{option.icon}</span>
                  <span>
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {option.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-6 text-left">
              <div>
                <p className="text-sm font-medium text-slate-950">
                  Start the creation session
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Open the transcript and begin shaping the brief.
                </p>
              </div>
              <button
                onClick={handleStart}
                className="inline-flex h-11 items-center gap-2 border border-slate-950 bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Play className="h-4 w-4" />
                Start
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
