import { getVerifiedSession } from "@/features/auth/public-server";
import type {
  AnalyticsPendingData,
  SurveyAnalyticsData,
} from "@/features/surveys/server/analytics/dashboard-analytics";
import { getSurveyAnalyticsViewModel } from "@/features/surveys/server/use-cases/get-survey-analytics";
import { readJsonResponseValue } from "@/shared/http/json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAnalyticsPendingData(value: unknown): value is AnalyticsPendingData {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    (value.status === "not_generated" ||
      value.status === "queued" ||
      value.status === "running" ||
      value.status === "failed") &&
    typeof value.message === "string" &&
    isRecord(value.conversationStats) &&
    typeof value.conversationStats.total === "number" &&
    typeof value.conversationStats.completed === "number" &&
    isRecord(value.analyticsState)
  );
}

function isSurveyAnalyticsData(value: unknown): value is SurveyAnalyticsData {
  return (
    isRecord(value) &&
    value.status === "ready" &&
    typeof value.surveyId === "string" &&
    typeof value.surveyTitle === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.snapshotVersion === "number" &&
    isRecord(value.analyticsState) &&
    isRecord(value.program) &&
    isRecord(value.brief) &&
    isRecord(value.participation) &&
    isRecord(value.quality) &&
    isRecord(value.coverage) &&
    Array.isArray(value.findings) &&
    Array.isArray(value.derivedMetrics) &&
    Array.isArray(value.recommendations) &&
    Array.isArray(value.dataGaps) &&
    Array.isArray(value.keyQuotes) &&
    Array.isArray(value.timeline)
  );
}

function parseAnalyticsPayload(
  value: unknown,
): SurveyAnalyticsData | AnalyticsPendingData {
  if (isSurveyAnalyticsData(value) || isAnalyticsPendingData(value)) {
    return value;
  }

  throw new Error("Invalid analytics response payload");
}

export async function getSurveyAnalyticsInitialData(
  surveyId: string,
  language: string | null,
): Promise<SurveyAnalyticsData | AnalyticsPendingData> {
  const session = await getVerifiedSession();
  const response = await getSurveyAnalyticsViewModel({
    surveyId,
    session,
    language,
  });

  if (!response.ok) {
    let message = "Failed to load analytics";

    try {
      const payload = await readJsonResponseValue(response);
      if (isRecord(payload) && typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parsing failures and use the fallback message.
    }

    throw new Error(message);
  }

  return parseAnalyticsPayload(await readJsonResponseValue(response));
}
