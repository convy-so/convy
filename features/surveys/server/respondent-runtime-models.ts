import type {
  CanonicalRespondentTurn,
  RespondentLanguage,
} from "@/features/surveys/server/respondent-conversation";
import {
  coveragePlanSchema,
  researchBriefSchema,
  sessionStateSchema,
  type CoveragePlan,
  type ResearchBrief,
  type SessionState,
} from "@/features/surveys/server/education/types";

function isRespondentLanguage(value: unknown): value is RespondentLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

export type RespondentTurnBoundaryPayloadInput = {
  brief: { brief: unknown };
  coveragePlan: { plan: unknown };
  sessionRow: {
    id: string;
    sessionState: unknown;
  };
  canonicalTurn: CanonicalRespondentTurn;
  language?: RespondentLanguage;
  surveyLanguage?: string | null;
};

export type RespondentTurnNormalizedPayload = {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  session: {
    id: string;
    state: SessionState;
  };
  turn: CanonicalRespondentTurn;
  language: RespondentLanguage;
};

export function normalizeRespondentLanguage(
  requestedLanguage: RespondentLanguage | undefined,
  fallbackLanguage: string | null,
): RespondentLanguage {
  if (isRespondentLanguage(requestedLanguage)) {
    return requestedLanguage;
  }

  if (isRespondentLanguage(fallbackLanguage)) {
    return fallbackLanguage;
  }

  return "en";
}

export function normalizeRespondentTurnPayload(
  input: RespondentTurnBoundaryPayloadInput,
): RespondentTurnNormalizedPayload {
  return {
    brief: researchBriefSchema.parse(input.brief.brief),
    coveragePlan: coveragePlanSchema.parse(input.coveragePlan.plan),
    session: {
      id: input.sessionRow.id,
      state: sessionStateSchema.parse(input.sessionRow.sessionState),
    },
    turn: input.canonicalTurn,
    language: normalizeRespondentLanguage(input.language, input.surveyLanguage ?? null),
  };
}
