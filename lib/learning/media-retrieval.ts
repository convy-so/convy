import { z } from "zod";
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("media-retrieval");

const rerankSchema = z.object({
  index: z.number(),
  reason: z.string(),
});

interface BingImageResult {
  name: string;
  hostPageDisplayUrl: string;
  hostPageUrl?: string;
  contentUrl: string;
  width: number;
  height: number;
  encodingFormat: string;
}

interface YouTubeVideoResult {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
  };
}

export type MediaToolErrorCode =
  | "config_missing"
  | "provider_request_failed"
  | "no_results"
  | "rerank_failed"
  | "no_suitable_result"
  | "duplicate_call_blocked"
  | "pipeline_error";

export type MediaToolFailure = {
  success: false;
  mediaType: "image" | "video";
  errorCode: MediaToolErrorCode;
  reason: string;
  retryHint: string;
  suggestedAction: string;
  query: string;
  provider?: string;
};

export type ImageToolSuccess = {
  success: true;
  mediaType: "image";
  query: string;
  url: string;
  reason: string;
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  provider: "bing";
  assetId: string;
  width: number;
  height: number;
};

export type VideoToolSuccess = {
  success: true;
  mediaType: "video";
  query: string;
  url: string;
  watchUrl: string;
  reason: string;
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  provider: "youtube";
  assetId: string;
  channelTitle: string;
  publishedAt: string;
};

export type MediaToolResult =
  | MediaToolFailure
  | ImageToolSuccess
  | VideoToolSuccess;

function createMediaFailure(input: {
  mediaType: "image" | "video";
  errorCode: MediaToolErrorCode;
  reason: string;
  retryHint: string;
  suggestedAction: string;
  query: string;
  provider?: string;
}): MediaToolFailure {
  return {
    success: false,
    mediaType: input.mediaType,
    errorCode: input.errorCode,
    reason: input.reason,
    retryHint: input.retryHint,
    suggestedAction: input.suggestedAction,
    query: input.query,
    provider: input.provider,
  };
}

function createMediaFailureFromError(input: {
  error: unknown;
  mediaType: "image" | "video";
  query: string;
  provider: "bing" | "youtube";
}): MediaToolFailure {
  const message = input.error instanceof Error ? input.error.message : "Unknown pipeline error";

  if (message.includes("API_KEY is not set")) {
    return createMediaFailure({
      mediaType: input.mediaType,
      errorCode: "config_missing",
      reason: `${input.provider} search is unavailable because the provider API key is not configured.`,
      retryHint: "Continue tutoring without external media for this turn.",
      suggestedAction: "Do not retry this tool call in this response.",
      query: input.query,
      provider: input.provider,
    });
  }

  if (message.includes("failed with status")) {
    return createMediaFailure({
      mediaType: input.mediaType,
      errorCode: "provider_request_failed",
      reason: `${input.provider} search failed while fetching candidates.`,
      retryHint: "Retry later or continue without media if it is not essential.",
      suggestedAction: "Avoid repeating the same query immediately.",
      query: input.query,
      provider: input.provider,
    });
  }

  return createMediaFailure({
    mediaType: input.mediaType,
    errorCode: "pipeline_error",
    reason: `${input.provider} media search could not complete for this query.`,
    retryHint: "Only retry if showing media is essential and you can reformulate the query more narrowly.",
    suggestedAction: "If you retry, use a more specific educational query.",
    query: input.query,
    provider: input.provider,
  });
}

export async function searchBingImages(query: string, imageType: string): Promise<BingImageResult[]> {
  const apiKey = process.env.BING_IMAGE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("BING_IMAGE_SEARCH_API_KEY is not set");
  }

  const url = new URL("https://api.bing.microsoft.com/v7.0/images/search");
  url.searchParams.append("q", query);
  url.searchParams.append("count", "10");
  url.searchParams.append("safeSearch", "Strict");
  if (imageType) {
    url.searchParams.append("imageType", imageType);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Bing Image Search failed with status ${response.status}`);
  }

  const data = await response.json();
  const values: BingImageResult[] = data.value || [];

  return values.filter(
    (img) =>
      img.width >= 300 &&
      img.height >= 300 &&
      img.encodingFormat !== "bmp" &&
      img.encodingFormat !== "tiff"
  );
}

export async function searchYouTubeVideos(query: string): Promise<YouTubeVideoResult[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_DATA_API_KEY is not set");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.append("key", apiKey);
  url.searchParams.append("q", query);
  url.searchParams.append("part", "snippet");
  url.searchParams.append("type", "video");
  url.searchParams.append("maxResults", "10");
  url.searchParams.append("safeSearch", "strict");
  url.searchParams.append("relevanceLanguage", "en");
  url.searchParams.append("videoDuration", "medium");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`YouTube API failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

export async function rerankImages(
  concept: string,
  studentContext: string,
  candidates: BingImageResult[]
): Promise<{ index: number; reason: string; errorCode?: "rerank_failed" }> {
  const formatted = candidates
    .map(
      (c, i) =>
        `[${i}] Title: ${c.name} | Source: ${c.hostPageDisplayUrl} | URL: ${c.contentUrl}`
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
    const { generateStructuredOutput } = await import("@/lib/ai/runtime");
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
  candidates: YouTubeVideoResult[]
): Promise<{ index: number; reason: string; errorCode?: "rerank_failed" }> {
  const formatted = candidates
    .map(
      (c, i) =>
        `[${i}] Title: ${c.snippet.title} | Channel: ${c.snippet.channelTitle} | Description: ${c.snippet.description.substring(
          0,
          200
        )}`
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
    const { generateStructuredOutput } = await import("@/lib/ai/runtime");
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

export async function executeImageSearchPipeline(
  query: string,
  imageType: string,
  concept: string,
  studentContext: string
): Promise<MediaToolResult> {
  try {
    const candidates = await searchBingImages(query, imageType);
    if (candidates.length === 0) {
      return createMediaFailure({
        mediaType: "image",
        errorCode: "no_results",
        reason: "No image candidates matched the query.",
        retryHint: "Try a more specific educational query with the concept and desired visual type.",
        suggestedAction: "Add terms like labeled diagram, cross-section, or annotated photo.",
        query,
        provider: "bing",
      });
    }

    const { index, reason, errorCode } = await rerankImages(concept, studentContext, candidates);
    if (index === -1 || !candidates[index]) {
      return createMediaFailure({
        mediaType: "image",
        errorCode: errorCode ?? "no_suitable_result",
        reason,
        retryHint:
          errorCode === "rerank_failed"
            ? "Continue without an image unless it is essential."
            : "Try a narrower query that names the exact concept and visual format.",
        suggestedAction:
          errorCode === "rerank_failed"
            ? "Do not repeat the same tool call immediately."
            : "Prefer queries such as '<concept> labeled diagram' or '<concept> microscope photo'.",
        query,
        provider: "bing",
      });
    }

    const selected = candidates[index];
    return {
      success: true,
      mediaType: "image",
      query,
      url: selected.contentUrl,
      reason,
      title: selected.name,
      sourceLabel: selected.hostPageDisplayUrl,
      sourceUrl: selected.hostPageUrl ?? selected.contentUrl,
      provider: "bing",
      assetId: selected.contentUrl,
      width: selected.width,
      height: selected.height,
    };
  } catch (error) {
    log.error("Image search pipeline failed", serializeError(error));
    return createMediaFailureFromError({
      error,
      mediaType: "image",
      query,
      provider: "bing",
    });
  }
}

export async function executeVideoSearchPipeline(
  query: string,
  concept: string,
  studentContext: string
): Promise<MediaToolResult> {
  try {
    const candidates = await searchYouTubeVideos(query);
    if (candidates.length === 0) {
      return createMediaFailure({
        mediaType: "video",
        errorCode: "no_results",
        reason: "No video candidates matched the query.",
        retryHint: "Try a more specific explainer-style query.",
        suggestedAction: "Add words like explained, tutorial, animation, or experiment.",
        query,
        provider: "youtube",
      });
    }

    const { index, reason, errorCode } = await rerankVideos(concept, studentContext, candidates);
    if (index === -1 || !candidates[index]) {
      return createMediaFailure({
        mediaType: "video",
        errorCode: errorCode ?? "no_suitable_result",
        reason,
        retryHint:
          errorCode === "rerank_failed"
            ? "Continue without a video unless motion is essential for this explanation."
            : "Try a shorter, more focused query with the exact process or experiment.",
        suggestedAction:
          errorCode === "rerank_failed"
            ? "Do not repeat the same tool call immediately."
            : "Prefer queries like '<concept> explained', '<concept> animation', or '<concept> experiment'.",
        query,
        provider: "youtube",
      });
    }

    const selected = candidates[index];
    return {
      success: true,
      mediaType: "video",
      query,
      url: "https://www.youtube.com/embed/" + selected.id.videoId,
      watchUrl: "https://www.youtube.com/watch?v=" + selected.id.videoId,
      reason,
      title: selected.snippet.title,
      sourceLabel: selected.snippet.channelTitle,
      sourceUrl: "https://www.youtube.com/watch?v=" + selected.id.videoId,
      provider: "youtube",
      assetId: selected.id.videoId,
      channelTitle: selected.snippet.channelTitle,
      publishedAt: selected.snippet.publishedAt,
    };
  } catch (error) {
    log.error("Video search pipeline failed", serializeError(error));
    return createMediaFailureFromError({
      error,
      mediaType: "video",
      query,
      provider: "youtube",
    });
  }
}
