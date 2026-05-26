import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { wrapAISDK } from "braintrust";

export const GEMINI_FLASH_LITE_ID = "gemini-3.1-flash-lite";
export const GEMINI_FLASH_ID = "gemini-3-flash-preview";
export const GPT_4_1_MINI_ID = "gpt-4.1-mini";

export const flashLiteModel = wrapAISDK(google(GEMINI_FLASH_LITE_ID));
export const flashModel = wrapAISDK(google(GEMINI_FLASH_ID));
export const gpt41MiniModel = wrapAISDK(openai(GPT_4_1_MINI_ID));

/** High-volume background calls (analysis, indexing helpers). */
export const analysisModel = flashLiteModel;

export const defaultModel = flashLiteModel;

export { google };
