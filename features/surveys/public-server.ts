import "server-only";

export * from "@/features/surveys/server/survey-access";
export * from "@/features/surveys/server/translation-service";

export function buildSurveyPublicPath(identifier: string) {
  return `/s/${identifier}`;
}
