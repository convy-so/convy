"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { createSurveyDraft, SurveyApiError } from "@/lib/api/surveys";
import {
  appLocales,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";

export type SurveyExtractedData = {
  objective?: { goal?: string };
  targetAudience?: { description?: string };
  programId?: string;
  readyForSampling?: boolean;
  mediaDecision?: unknown;
};

export type SurveyCollectedInfo = {
  objective?: boolean;
  targetAudience?: boolean;
  subjectDefined?: boolean;
  programIdentified?: boolean;
  scope?: boolean;
  successCriteria?: boolean;
  constraints?: boolean;
  tone?: boolean;
  requiredQuestions?: boolean;
  metrics?: boolean;
  personalInfo?: boolean;
};

type SurveyDraftCreateResponse = Awaited<ReturnType<typeof createSurveyDraft>>;

type UseSurveyCreationDraftParams = {
  authLoading: boolean;
  locale: string;
  t: (key: string) => string;
  user: {
    emailVerified?: boolean | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSupportedLocale(
  value: unknown,
  fallback: AppLocale = "en",
): AppLocale {
  return isAppLocale(value) ? value : fallback;
}

export function isSupportedSurveyCreationLocale(
  value: unknown,
): value is AppLocale {
  return isAppLocale(value);
}

export function useSurveyCreationDraft({
  authLoading,
  locale,
  t,
  user,
}: UseSurveyCreationDraftParams) {
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLocale>(getSupportedLocale(locale));
  const [availableLanguages, setAvailableLanguages] = useState<AppLocale[]>([
    ...appLocales,
  ]);
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);
  const [extractedData, setExtractedData] = useState<SurveyExtractedData | null>(
    null,
  );
  const [collectedInfo, setCollectedInfo] = useState<SurveyCollectedInfo | null>(
    null,
  );
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  const updateSurveyMode = useCallback(async (id: string | null, isVoice: boolean) => {
    setIsVoiceSurvey(isVoice);

    if (!id) {
      return;
    }

    try {
      await fetch(`/api/surveys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVoice }),
      });
    } catch {
      toast.error("Failed to save survey mode. Please try again.");
    }
  }, []);

  const ensureDraftExists = useCallback(async (): Promise<
    SurveyDraftCreateResponse | string | null
  > => {
    if (surveyId) return surveyId;
    if (isCreatingDraft) {
      console.warn("[Client] ensureDraftExists skipped: already creating...");
      return null;
    }

    setIsCreatingDraft(true);
    try {
      const surveyData = await createSurveyDraft({
        language,
        isVoice: isVoiceSurvey,
      });
      setSurveyId(surveyData.id);
      window.history.replaceState(null, "", `?id=${surveyData.id}`);
      return surveyData;
    } catch (error) {
      if (error instanceof SurveyApiError) {
        console.error(
          `[Client] ensureDraftExists FAILED: ${error.status} ${error.message}`,
        );

        if (error.status === 401) {
          if (error.message === "EMAIL_NOT_VERIFIED") {
            setAuthError("Please verify your email to continue.");
          } else {
            setAuthError(t("Authentication.Required"));
          }
          return null;
        }

        if (error.status === 403) {
          toast.error(error.message);
          return null;
        }

        toast.error(error.message || "Failed to initialize draft.");
        return null;
      }

      console.error("[EnsureDraft] Failed:", error);
      toast.error("Failed to initialize draft.");
      throw error;
    } finally {
      setIsCreatingDraft(false);
    }
  }, [isCreatingDraft, isVoiceSurvey, language, surveyId, t]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAuthError(t("Authentication.Required"));
      setIsInitializing(false);
      return;
    }

    if (!user.emailVerified) {
      setAuthError("Please verify your email to continue.");
      setIsInitializing(false);
      return;
    }

    setAuthError(null);
    setIsInitializing(false);
  }, [authLoading, t, user]);

  useEffect(() => {
    if (!user || authLoading || surveyId) return;

    let cancelled = false;

    const resolveInitialLanguage = async () => {
      try {
        let nextLanguage = getSupportedLocale(locale);
        const response = await fetch("/api/user/language");

        if (response.ok) {
          const data = await response.json();
          if (isRecord(data)) {
            const userLocale = isAppLocale(data.uiLocale)
              ? data.uiLocale
              : isAppLocale(data.preferredLanguage)
                ? data.preferredLanguage
                : null;

            if (userLocale) {
              nextLanguage = userLocale;
            }
          }
        }

        if (!cancelled) {
          setAvailableLanguages([...appLocales]);
          setLanguage((currentLanguage) =>
            currentLanguage === nextLanguage ? currentLanguage : nextLanguage,
          );
        }
      } catch (error) {
        console.error("Failed to fetch user language:", error);
      }
    };

    void resolveInitialLanguage();

    return () => {
      cancelled = true;
    };
  }, [authLoading, locale, surveyId, user]);

  return {
    surveyId,
    setSurveyId,
    isInitializing,
    setIsInitializing,
    authError,
    setAuthError,
    isReadOnly,
    setIsReadOnly,
    surveyStatus,
    setSurveyStatus,
    language,
    setLanguage,
    availableLanguages,
    isVoiceSurvey,
    setIsVoiceSurvey,
    extractedData,
    setExtractedData,
    collectedInfo,
    setCollectedInfo,
    isCreatingDraft,
    ensureDraftExists,
    updateSurveyMode,
  };
}
