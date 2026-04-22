import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { tutorAnalysisModel, tutorChatModel } from "@/lib/ai/models";

type StructuredGenerationParams<TSchema extends z.ZodTypeAny> = {
  schema: TSchema;
  prompt: string;
  system?: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
};

type StreamUiTextParams = {
  messages: UIMessage[];
  system: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
};

export async function generateStructuredOutput<TSchema extends z.ZodTypeAny>(
  params: StructuredGenerationParams<TSchema>,
): Promise<z.infer<TSchema>> {
  const { output } = await generateText({
    model: params.model ?? tutorAnalysisModel,
    system: params.system,
    prompt: params.prompt,
    temperature: params.temperature ?? 0.2,
    maxOutputTokens: params.maxOutputTokens ?? 1500,
    output: Output.object({
      schema: params.schema,
    }),
  });

  return output;
}

export async function streamUiText(params: StreamUiTextParams) {
  const messages = await convertToModelMessages(params.messages);
  return streamText({
    model: params.model ?? tutorChatModel,
    system: params.system,
    messages,
    temperature: params.temperature ?? 0.3,
    maxOutputTokens: params.maxOutputTokens ?? 900,
  });
}
