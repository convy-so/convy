import { createLogger, serializeError } from "@/shared/infra/logger";

import {
  createMediaFailure,
  createMediaFailureFromError,
} from "./media-failure-result";
import { searchTavilyImages, searchYouTubeVideos } from "./provider-search";
import { rerankImages, rerankVideos } from "./reranking";
import { type MediaToolResult } from "./media-retrieval-contract";

const log = createLogger("media-retrieval");

export async function executeImageSearchPipeline(
  query: string,
  imageType: string,
  concept: string,
  studentContext: string,
): Promise<MediaToolResult> {
  try {
    const candidates = await searchTavilyImages(query, imageType);
    if (candidates.length === 0) {
      return createMediaFailure({
        mediaType: "image",
        errorCode: "no_results",
        reason: "No image candidates matched the query.",
        retryHint:
          "Try a more specific educational query with the concept and desired visual type.",
        suggestedAction:
          "Add terms like labeled diagram, cross-section, or annotated photo.",
        query,
        provider: "tavily",
      });
    }

    const { index, reason, errorCode } = await rerankImages(
      concept,
      studentContext,
      candidates,
    );
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
        provider: "tavily",
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
      provider: "tavily",
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
      provider: "tavily",
    });
  }
}

export async function executeVideoSearchPipeline(
  query: string,
  concept: string,
  studentContext: string,
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

    const { index, reason, errorCode } = await rerankVideos(
      concept,
      studentContext,
      candidates,
    );
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
      url: `https://www.youtube.com/embed/${selected.id.videoId}`,
      watchUrl: `https://www.youtube.com/watch?v=${selected.id.videoId}`,
      reason,
      title: selected.snippet.title,
      sourceLabel: selected.snippet.channelTitle,
      sourceUrl: `https://www.youtube.com/watch?v=${selected.id.videoId}`,
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
