"use client";

import { AlertCircle, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations>;

export function SurveyRespondSuspenseFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
          <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
        </div>
      </div>
    </div>
  );
}

export function SurveyRespondLoadingState({
  translations,
}: {
  translations: Translate;
}) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
          <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-500 font-medium animate-pulse">
          {translations("loading")}
        </p>
      </div>
    </div>
  );
}

export function SurveyRespondErrorState({
  initError,
  translations,
}: {
  initError: Error;
  translations: Translate;
}) {
  const title =
    initError.message === "This survey is no longer accepting responses" ||
    initError.message === "Survey has reached its participant limit"
      ? translations("closed")
      : initError.message === "Failed to load survey"
        ? translations("loadFailed")
        : translations("notFound");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{title}</h1>
        <p className="text-gray-500 text-lg">{translations("errorHelp")}</p>
      </div>
    </div>
  );
}

export function SurveyRespondCompletedState({
  translations,
  hasRespondentSession,
  isResumeLinkLoading,
  isPrivacyActionLoading,
  onCopyResumeLink,
  onExportData,
  onDeleteData,
}: {
  translations: Translate;
  hasRespondentSession: boolean;
  isResumeLinkLoading: boolean;
  isPrivacyActionLoading: boolean;
  onCopyResumeLink: () => void;
  onExportData: () => void;
  onDeleteData: () => void;
}) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-50 via-white to-white" />
      <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl p-12 max-w-lg w-full text-center border border-gray-100">
        <div className="mb-8 flex items-center justify-center">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
            </div>
            <div className="absolute -inset-2 rounded-full border-2 border-emerald-100 animate-pulse" />
          </div>
        </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-gray-900">
          {translations("thankYou")}
        </h1>
        <p className="mb-10 font-light leading-relaxed text-gray-500">
          {translations("thankYouMessage")}
        </p>
        <div className="space-y-3">
          {hasRespondentSession ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                onClick={onCopyResumeLink}
                disabled={isResumeLinkLoading}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {isResumeLinkLoading
                  ? "Preparing resume link..."
                  : "Copy resume link"}
              </button>
              <button
                onClick={onExportData}
                disabled={isPrivacyActionLoading}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Export my data
              </button>
              <button
                onClick={onDeleteData}
                disabled={isPrivacyActionLoading}
                className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                Delete my data
              </button>
            </div>
          ) : null}
          <button
            onClick={() => window.close()}
            className="w-full rounded-2xl bg-gray-900 px-8 py-4 font-semibold text-white transition-all hover:-translate-y-1 hover:bg-gray-800 hover:shadow-md active:scale-95"
          >
            {translations("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
