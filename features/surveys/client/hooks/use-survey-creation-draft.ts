"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  createSurveyDraftAction,
} from "@/app/actions/survey";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import {
  appLocales,
  isAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";

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

type SurveyDraftCreateResponse = {
  id: string;
  title: string;
  deliveryMode: "link" | "classroom_assigned";
  classroomId?: string | null;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    parts: Array<{ type: "text"; text: string }>;
    timestamp: string;
  }>;
};

type UseSurveyCreationDraftParams = {
  authLoading: boolean;
  initialLanguage?: AppLocale;
  initialSurveyId?: string | null;
  locale: string;
  t: (key: string) => string;
  user: {
    emailVerified?: boolean | null;
  } | null;
};

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
  initialLanguage,
  initialSurveyId,
  locale,
  t,
  user,
}: UseSurveyCreationDraftParams) {
  const [surveyId, setSurveyId] = useState<string | null>(initialSurveyId ?? null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLocale>(
    getSupportedLocale(initialLanguage ?? locale),
  );
  const availableLanguages = appLocales;
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);
  const [extractedData, setExtractedData] = useState<SurveyExtractedData | null>(
    null,
  );
  const [collectedInfo, setCollectedInfo] = useState<SurveyCollectedInfo | null>(
    null,
  );
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

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
      const result = await createSurveyDraftAction({
        language,
        isVoice: isVoiceSurvey,
      });
      if (!result.success) {
        if (result.error.code === "UNAUTHORIZED" || result.error.code === "UNAUTHENTICATED") {
          setAuthError(t("Authentication.Required"));
          return null;
        }
        toast.error(getFriendlyActionError(result.error, "Failed to initialize draft."));
        return null;
      }

      const surveyData = result.data;
      setSurveyId(surveyData.id);
      window.history.replaceState(null, "", `?id=${surveyData.id}`);
      return surveyData;
    } catch (error) {
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
  };
}
