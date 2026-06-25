import { z } from "zod";

export const rerankSchema = z.object({
  index: z.number(),
  reason: z.string(),
});

export interface TavilyImageResult {
  name: string;
  hostPageDisplayUrl: string;
  hostPageUrl?: string;
  contentUrl: string;
  width: number | null;
  height: number | null;
  encodingFormat: string;
  description?: string;
}

export interface YouTubeVideoResult {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
  };
}

export type TavilySearchResponse = {
  images: Array<{ url: string; description?: string }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    images?: Array<{ url: string; description?: string }>;
  }>;
};

export type StructuredOutputGenerator = <TSchema extends z.ZodTypeAny>(input: {
  schema: TSchema;
  prompt: string;
  system: string;
}) => Promise<z.infer<TSchema>>;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type MediaRetrievalTestHooks = {
  tavilySearch: ((query: string, imageType: string) => Promise<TavilySearchResponse>) | null;
  youtubeFetch: FetchLike | null;
  generateStructuredOutput: StructuredOutputGenerator | null;
};

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
  provider: "tavily";
  assetId: string;
  width: number | null;
  height: number | null;
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
