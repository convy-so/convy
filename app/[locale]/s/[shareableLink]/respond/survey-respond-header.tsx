"use client";

import Image from "next/image";
import { Globe, Mic } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/ui/tailwind-class-utils";

type Translate = ReturnType<typeof useTranslations>;

export function SurveyRespondHeader({
  surveyTitle,
  conversationId,
  isResumeLinkLoading,
  onCopyResumeLink,
  isVoiceAvailable,
  isVoiceMode,
  onToggleVoiceMode,
  translations,
  locale,
  messagesLength,
  hasStarted,
  onLanguageChange,
}: {
  surveyTitle?: string;
  conversationId: string | null;
  isResumeLinkLoading: boolean;
  onCopyResumeLink: () => void;
  isVoiceAvailable?: boolean;
  isVoiceMode: boolean;
  onToggleVoiceMode: () => void;
  translations: Translate;
  locale: string;
  messagesLength: number;
  hasStarted: boolean;
  onLanguageChange: (locale: string) => void;
}) {
  return (
    <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-10 flex-shrink-0">
      <div className="flex items-center justify-between gap-4 h-14">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Image
            src="/logo.svg"
            alt="Convyy Logo"
            width={32}
            height={32}
            className="w-8 h-8 flex-shrink-0"
          />
          <span className="font-bold text-gray-900 text-lg hidden sm:block">
            Convyy
          </span>
        </div>

        <div className="flex-[2] flex justify-center min-w-0">
          <h1 className="font-bold text-gray-900 tracking-tight text-base sm:text-lg truncate px-2 text-center">
            {surveyTitle}
          </h1>
        </div>

        <div className="flex-1 flex items-center justify-end gap-2 sm:gap-4">
          {conversationId ? (
            <button
              onClick={onCopyResumeLink}
              disabled={isResumeLinkLoading}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {isResumeLinkLoading ? "Preparing link..." : "Copy resume link"}
            </button>
          ) : null}
          {isVoiceAvailable ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleVoiceMode}
                className={cn(
                  "flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap",
                  isVoiceMode
                    ? "bg-gray-900 text-white shadow-md scale-105"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
              >
                {isVoiceMode ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="hidden xs:inline">
                      {translations("voiceMode")}
                    </span>
                    <span className="xs:hidden">Live</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">
                      {translations("tryVoice")}
                    </span>
                    <span className="xs:hidden">IA</span>
                  </>
                )}
              </button>
            </div>
          ) : null}

          <div className="flex items-center border-l border-gray-100 pl-2 sm:pl-4">
            <div className="relative group">
              <button
                disabled={messagesLength > 0 || hasStarted}
                className="flex items-center gap-1.5 sm:gap-2 text-gray-500 hover:text-gray-900 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="uppercase hidden xs:inline">{locale}</span>
              </button>
              {!hasStarted && messagesLength === 0 ? (
                <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 min-w-[140px]">
                    {(["en", "fr", "de", "es", "it"] as const).map((language) => (
                      <button
                        key={language}
                        onClick={() => onLanguageChange(language)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors",
                          locale === language
                            ? "bg-gray-50 text-gray-900 font-semibold"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
                        )}
                      >
                        <span className="capitalize">
                          {new Intl.DisplayNames([language], { type: "language" }).of(
                            language,
                          )}
                        </span>
                        {locale === language ? (
                          <div className="w-1 h-1 rounded-full bg-gray-900" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
