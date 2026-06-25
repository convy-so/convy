import { createLogger, serializeError } from "@/shared/infra/logger";

import { getMediaRetrievalTestHooks } from "./test-hooks";
import {
  rerankSchema,
  type TavilyImageResult,
  type YouTubeVideoResult,
} from "./media-retrieval-contract";

const log = createLogger("media-retrieval");

export async function rerankImages(
  concept: string,
  studentContext: string,
  candidates: TavilyImageResult[],
): Promise<{ index: number; reason: string; errorCode?: "rerank_failed" }> {
  const formatted = candidates
    .map(
      (candidate, index) =>
        `[${index}] Title: ${candidate.name} | Source: ${candidate.hostPageDisplayUrl} | Page: ${candidate.hostPageUrl ?? "unknown"} | Description: ${candidate.description ?? "n/a"} | URL: ${candidate.contentUrl}`,
    )
    .join("\n");

  const prompt = `You are helping select the best image to show a student.

Student context: ${studentContext}
Concept being taught: ${concept}

Here are the candidate images returned by a search:
${formatted}

Select the single best image for this student learning this concept right now.
Prefer images that are: clear and educational, appropriately labeled if a diagram,
from a reputable educational source, and visually appropriate for the student's level.
Reject any image that seems misleading, too advanced, too simplistic, or irrelevant.

Respond with a JSON object only, no other text:
{"index": <0-9 or -1 if none are suitable>, "reason": "<one sentence>"}`;

  try {
    const generateStructuredOutput =
      getMediaRetrievalTestHooks().generateStructuredOutput ??
      (await import("@/shared/ai/model-generation")).generateStructuredOutput;
    return await generateStructuredOutput({
      schema: rerankSchema,
      prompt,
      system: "You are a helpful educational assistant selecting media.",
    });
  } catch (error) {
    log.error("Image reranking failed", serializeError(error));
    return {
      index: -1,
      reason: "Could not confidently verify a high-quality educational image from the candidates.",
      errorCode: "rerank_failed",
    };
  }
}

export async function rerankVideos(
  concept: string,
  studentContext: string,
  candidates: YouTubeVideoResult[],
): Promise<{ index: number; reason: string; errorCode?: "rerank_failed" }> {
  const formatted = candidates
    .map(
      (candidate, index) =>
        `[${index}] Title: ${candidate.snippet.title} | Channel: ${candidate.snippet.channelTitle} | Description: ${candidate.snippet.description.substring(0, 200)}`,
    )
    .join("\n");

  const prompt = `You are helping select the best video to show a student.

Student context: ${studentContext}
Concept being taught: ${concept}

Here are the candidate videos:
${formatted}

Select the single best video. Strongly prefer videos from established educational channels
such as: Khan Academy, Crash Course, TED-Ed, Kurzgesagt, 3Blue1Brown, National Geographic
Education, Professor Leonard, or university channels. Prefer focused explainer videos over
long documentaries or lectures. Reject anything that seems tangentially related or
entertainment-focused rather than educational.

Respond with JSON only:
{"index": <0-9 or -1 if none are suitable>, "reason": "<one sentence>"}`;

  try {
    const generateStructuredOutput =
      getMediaRetrievalTestHooks().generateStructuredOutput ??
      (await import("@/shared/ai/model-generation")).generateStructuredOutput;
    return await generateStructuredOutput({
      schema: rerankSchema,
      prompt,
      system: "You are a helpful educational assistant selecting media.",
    });
  } catch (error) {
    log.error("Video reranking failed", serializeError(error));
    return {
      index: -1,
      reason: "Could not confidently verify a strong educational video from the candidates.",
      errorCode: "rerank_failed",
    };
  }
}
