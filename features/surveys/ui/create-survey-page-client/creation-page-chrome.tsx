"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

type Translate = ReturnType<typeof useTranslations>;

export function CreationPageChrome({
  surveyId,
  isConversationLocked,
  isCreatingDraft,
  surveyStatus,
  initialLoadError,
  isInitializing,
  children,
  translations,
}: {
  surveyId: string | null;
  isConversationLocked: boolean;
  isCreatingDraft: boolean;
  surveyStatus: string | null;
  initialLoadError: string | null;
  isInitializing: boolean;
  children: ReactNode;
  translations: Translate;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-950">
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
        {initialLoadError ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {initialLoadError}
          </div>
        ) : null}

        <div className="flex flex-col items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:px-6 lg:px-8">
          {!surveyId ? (
            <div className="w-full py-2 text-center">
              <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
                <Sparkles className="h-5 w-5" />
                {translations("Title.Create")}
              </h1>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-1 text-slate-400 transition-colors hover:text-slate-950"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
                  {isConversationLocked ? "View Survey" : "Build Survey"}
                  {isCreatingDraft ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : null}
                </h1>
                {(isConversationLocked || surveyStatus === "completed") && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      Read Only
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 flex w-full items-center gap-4 sm:mt-0 sm:w-auto" />
        </div>

        {isConversationLocked && surveyId ? (
          <div className="flex items-center justify-center gap-2 border-b border-slate-200 px-4 py-2 text-sm text-slate-600">
            <Sparkles className="h-4 w-4" />
            <span>
              {surveyStatus === "creating"
                ? "This brief is ready for sample review. The creation chat is now locked."
                : "This survey is finalized and cannot be edited."}
            </span>
            <Link
              href={`/dashboard/surveys/${surveyId}`}
              className="font-medium hover:underline"
            >
              View Dashboard
            </Link>
          </div>
        ) : null}

        <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
          {isInitializing ? (
            <div className="flex items-center justify-center border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading survey state...
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
