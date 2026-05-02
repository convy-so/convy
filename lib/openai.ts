import OpenAI from "openai";

import { env } from "@/lib/env";

declare global {
  var learningOpenAIClient: OpenAI | undefined;
}

export function getOpenAIClient() {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for learning material processing.");
  }

  if (!global.learningOpenAIClient) {
    global.learningOpenAIClient = new OpenAI({ apiKey });
  }

  return global.learningOpenAIClient;
}
