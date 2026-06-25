import type { SurveyDetailsResponse } from "@/features/surveys/client/api/surveys-api";
import type { SurveyExtractedData } from "@/features/surveys/client/hooks/use-survey-creation-draft";
import { isAppLocale, type AppLocale } from "@/shared/i18n/config";

export type SurveyCreationSyncResponse = {
  messages?: unknown[];
  collectedInfo?: unknown;
  extractedData?: unknown;
  status?: string;
};

export type InitialSurveyCreationState = {
  surveyId: string;
  status: string;
  language?: string | null;
  isVoice?: boolean;
  permission?: {
    canEdit?: boolean;
  } | null;
  messages?: unknown[];
  collectedInfo?: unknown;
  extractedData?: unknown;
};

type CreationAccessState = {
  status: string | null;
  language: AppLocale | null;
  isVoice: boolean | null;
  canEdit: boolean;
  isFinished: boolean;
  readyForSampling: boolean;
};

export function createHiddenGreetingMessage() {
  return {
    id: `survey-create-bootstrap-${Date.now()}`,
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: "Start the conversation now. Greet the participant according to the system prompt instructions.",
      },
    ],
  };
}

export function isCreationStateRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveInitialCreationAccess(params: {
  surveyData: SurveyDetailsResponse | null;
  creationState: InitialSurveyCreationState;
  extractedData: SurveyExtractedData | null;
}): CreationAccessState {
  const surveyRecord = params.surveyData?.survey;
  const nextStatus = surveyRecord?.status ?? params.creationState.status ?? null;
  const nextLanguage =
    surveyRecord?.language ?? params.creationState.language ?? null;
  const nextIsVoice =
    typeof surveyRecord?.isVoice === "boolean"
      ? surveyRecord.isVoice
      : typeof params.creationState.isVoice === "boolean"
        ? params.creationState.isVoice
        : null;
  const canEdit =
    surveyRecord?.permission?.canEdit === true ||
    params.creationState.permission?.canEdit === true;

  return buildCreationAccessState({
    status: nextStatus,
    language: nextLanguage,
    isVoice: nextIsVoice,
    canEdit,
    extractedData: params.extractedData,
  });
}

export function resolveLoadedCreationAccess(params: {
  surveyData: unknown;
  extractedData: SurveyExtractedData | null;
}): CreationAccessState {
  const surveyRecord = isCreationStateRecord(params.surveyData)
    ? params.surveyData.survey
    : null;

  if (!isCreationStateRecord(surveyRecord)) {
    return buildCreationAccessState({
      status: null,
      language: null,
      isVoice: null,
      canEdit: false,
      extractedData: params.extractedData,
    });
  }

  return buildCreationAccessState({
    status:
      typeof surveyRecord.status === "string" ? surveyRecord.status : null,
    language:
      typeof surveyRecord.language === "string" ? surveyRecord.language : null,
    isVoice:
      typeof surveyRecord.isVoice === "boolean" ? surveyRecord.isVoice : null,
    canEdit:
      isCreationStateRecord(surveyRecord.permission) &&
      surveyRecord.permission.canEdit === true,
    extractedData: params.extractedData,
  });
}

export function isReadyForSampleConversation(params: {
  surveyId: string | null;
  surveyStatus: string | null;
  extractedData: SurveyExtractedData | null;
}) {
  if (!params.surveyId) {
    return false;
  }

  if (
    params.surveyStatus === "sample_review" ||
    params.surveyStatus === "active" ||
    params.surveyStatus === "completed"
  ) {
    return true;
  }

  return Boolean(params.extractedData?.readyForSampling);
}

function buildCreationAccessState(params: {
  status: string | null;
  language: string | null;
  isVoice: boolean | null;
  canEdit: boolean;
  extractedData: SurveyExtractedData | null;
}): CreationAccessState {
  return {
    status: params.status,
    language: isAppLocale(params.language) ? params.language : null,
    isVoice: params.isVoice,
    canEdit: params.canEdit,
    isFinished: Boolean(params.status && params.status !== "creating"),
    readyForSampling: Boolean(params.extractedData?.readyForSampling),
  };
}
