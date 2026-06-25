"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { CreatorSettingsPanel } from "@/features/surveys/ui/creator-settings-panel";
import type { SurveyDetailsResponse } from "@/features/surveys/client/api/surveys-api";
import { appLocaleLabels, appLocales, type AppLocale } from "@/shared/i18n/config";
import { cn } from "@/shared/ui/tailwind-class-utils";

type Translate = ReturnType<typeof useTranslations>;

export function SurveySettingsTab({
  surveyId,
  survey,
  settingsForm,
  customSlug,
  isSavingSlug,
  isSavingSettings,
  setSettingsForm,
  setCustomSlug,
  handleSaveSlug,
  handleClearSlug,
  handleSaveSettings,
  t,
}: {
  surveyId: string;
  survey: NonNullable<SurveyDetailsResponse["survey"]>;
  settingsForm: {
    title: string;
    participantLimit: number;
    language: AppLocale;
    isVoice: boolean;
  };
  customSlug: string;
  isSavingSlug: boolean;
  isSavingSettings: boolean;
  setSettingsForm: (
    value: {
      title: string;
      participantLimit: number;
      language: AppLocale;
      isVoice: boolean;
    },
  ) => void;
  setCustomSlug: (value: string) => void;
  handleSaveSlug: () => void;
  handleClearSlug: () => void;
  handleSaveSettings: () => void;
  t: Translate;
}) {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="mb-4 font-semibold text-gray-900">{t("Settings.Title")}</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("Settings.Fields.Title")}
            </label>
            <input
              type="text"
              value={settingsForm.title}
              onChange={(event) =>
                setSettingsForm({ ...settingsForm, title: event.target.value })
              }
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("Settings.Fields.Limit")}
            </label>
            <input
              type="number"
              value={settingsForm.participantLimit}
              onChange={(event) =>
                setSettingsForm({
                  ...settingsForm,
                  participantLimit: Number(event.target.value),
                })
              }
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Survey language
            </label>
            <select
              value={settingsForm.language}
              onChange={(event) =>
                setSettingsForm({
                  ...settingsForm,
                  language: event.target.value as AppLocale,
                })
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
            >
              {appLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {appLocaleLabels[locale]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <h4 className="mb-1 font-medium text-gray-900">
                {t("Settings.VoiceMode.Title")}
              </h4>
              <p className="text-sm text-gray-500">
                {t("Settings.VoiceMode.Description")}
              </p>
            </div>
            <button
              onClick={() =>
                setSettingsForm({
                  ...settingsForm,
                  isVoice: !settingsForm.isVoice,
                })
              }
              className={cn(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                settingsForm.isVoice ? "bg-indigo-600" : "bg-gray-200",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  settingsForm.isVoice ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <h4 className="font-medium text-gray-900">Custom survey URL</h4>
              <p className="text-sm text-gray-500">
                Replace the random public identifier with a teacher-defined slug.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={customSlug}
                onChange={(event) =>
                  setCustomSlug(event.target.value.toLowerCase())
                }
                placeholder="e.g. year10-pulse-check"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
              />
              <button
                onClick={handleSaveSlug}
                disabled={isSavingSlug || !customSlug.trim()}
                className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {isSavingSlug ? "Saving..." : "Save URL"}
              </button>
              <button
                onClick={handleClearSlug}
                disabled={isSavingSlug || !survey.customSlug}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-white disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Public URL:{" "}
              {survey.shareableUrl || "Publish the survey to generate a public link."}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSavingSettings ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("Settings.Save")
            )}
          </button>
        </div>
      </div>

      <CreatorSettingsPanel surveyId={surveyId} />
    </div>
  );
}
