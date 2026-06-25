import {
  type MediaToolErrorCode,
  type MediaToolFailure,
} from "./media-retrieval-contract";

export function createMediaFailure(input: {
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

export function createMediaFailureFromError(input: {
  error: unknown;
  mediaType: "image" | "video";
  query: string;
  provider: "tavily" | "youtube";
}): MediaToolFailure {
  const message =
    input.error instanceof Error ? input.error.message : "Unknown pipeline error";

  if (message.includes("API_KEY is not set") || message.includes("No API key provided")) {
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

  if (
    message.includes("failed with status") ||
    /search failed/i.test(message) ||
    /request timed out/i.test(message)
  ) {
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
    retryHint:
      "Only retry if showing media is essential and you can reformulate the query more narrowly.",
    suggestedAction: "If you retry, use a more specific educational query.",
    query: input.query,
    provider: input.provider,
  });
}
