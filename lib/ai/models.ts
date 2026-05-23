import type { LanguageModel } from "ai";

import { analysisModel, defaultModel, flashLiteModel } from "@/lib/ai/language-models";

export const tutorChatModel: LanguageModel = defaultModel;
export const tutorAnalysisModel: LanguageModel = analysisModel;
export const tutorFastModel: LanguageModel = flashLiteModel;

export function getTutorModelIds() {
  return {
    chat: typeof tutorChatModel === "string" ? tutorChatModel : tutorChatModel.modelId,
    analysis:
      typeof tutorAnalysisModel === "string"
        ? tutorAnalysisModel
        : tutorAnalysisModel.modelId,
    fast: typeof tutorFastModel === "string" ? tutorFastModel : tutorFastModel.modelId,
  };
}
