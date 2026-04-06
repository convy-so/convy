import type { SurveyMedia } from "@/lib/chat-types";
import { env } from "@/lib/env";

export function buildSurveyMediaAccessPath(input: {
  surveyId: string;
  mediaId: string;
}) {
  return `/api/media/surveys/${encodeURIComponent(input.surveyId)}/${encodeURIComponent(input.mediaId)}`;
}

export function buildLearningMaterialAccessPath(materialId: string) {
  return `/api/media/learning/${encodeURIComponent(materialId)}`;
}

export function resolveSurveyMediaAccess(input: {
  surveyId: string;
  media: SurveyMedia;
}): SurveyMedia {
  if (!input.media.id) {
    return input.media;
  }

  if (!input.media.storagePath || !input.media.storageBucket) {
    if (env.GDPR_EU_MODE) {
      return {
        ...input.media,
        requiresSignedAccess: true,
        url: "",
      };
    }

    return input.media;
  }

  return {
    ...input.media,
    requiresSignedAccess: true,
    url: buildSurveyMediaAccessPath({
      surveyId: input.surveyId,
      mediaId: input.media.id,
    }),
  };
}

export function resolveSurveyMediaListAccess(input: {
  surveyId: string;
  media: SurveyMedia[];
}) {
  return input.media.map((media) =>
    resolveSurveyMediaAccess({
      surveyId: input.surveyId,
      media,
    }),
  );
}
