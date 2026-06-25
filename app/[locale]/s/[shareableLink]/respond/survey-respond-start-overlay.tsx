"use client";

import { useTranslations } from "next-intl";

import { SurveyStartOverlay } from "@/features/surveys/ui/survey-start-overlay";
import type { Survey } from "./survey-respond-models";

type Translate = ReturnType<typeof useTranslations>;

export function SurveyRespondStartOverlay({
  hasStarted,
  isInitializing,
  locale,
  survey,
  onStart,
  translations,
}: {
  hasStarted: boolean;
  isInitializing: boolean;
  locale: string;
  survey: Survey | null;
  onStart: (language?: string) => Promise<void>;
  translations: Translate;
}) {
  if (hasStarted || isInitializing) {
    return null;
  }

  return (
    <SurveyStartOverlay
      onStart={onStart}
      initialLanguage={locale || "en"}
      title={survey?.title || translations("voiceSurveyTitle")}
      description={
        survey?.objective?.description ||
        translations("voiceSurveyIntro") ||
        "Join our interview. Choose your preferred language to begin."
      }
      isVoice={survey?.isVoice}
      translations={{
        selectLanguage: translations("selectLanguage"),
        micPermissionDenied: translations("micPermissionDenied"),
        micConsentTitle: translations("micConsentTitle"),
        micConsentDescription: translations("micConsentDescription"),
        initializing: translations("initializing"),
        startInterview: translations("startInterview"),
      }}
    />
  );
}
