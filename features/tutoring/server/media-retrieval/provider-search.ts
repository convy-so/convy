import {
  type TavilyImageResult,
  type TavilySearchResponse,
  type YouTubeVideoResult,
} from "./media-retrieval-contract";
import { getMediaRetrievalTestHooks } from "./test-hooks";
import { parseJsonValue } from "@/shared/http/json";

const TAVILY_SEARCH_TOPIC = "general";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTavilyImages(value: unknown): Array<{ url: string; description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string") {
      return [];
    }

    return [
      {
        url: item.url,
        description: typeof item.description === "string" ? item.description : undefined,
      },
    ];
  });
}

function parseTavilySearchResponse(value: unknown): TavilySearchResponse {
  if (!isRecord(value)) {
    return { images: [], results: [] };
  }

  return {
    images: parseTavilyImages(value.images),
    results: Array.isArray(value.results)
      ? value.results.flatMap((entry) => {
          if (!isRecord(entry)) {
            return [];
          }

          return [
            {
              title: typeof entry.title === "string" ? entry.title : "",
              url: typeof entry.url === "string" ? entry.url : "",
              content: typeof entry.content === "string" ? entry.content : "",
              images: parseTavilyImages(entry.images),
            },
          ];
        })
      : [],
  };
}

function isYouTubeVideoResult(value: unknown): value is YouTubeVideoResult {
  if (!isRecord(value) || !isRecord(value.id) || !isRecord(value.snippet)) {
    return false;
  }

  return (
    typeof value.id.videoId === "string" &&
    typeof value.snippet.title === "string" &&
    typeof value.snippet.description === "string" &&
    typeof value.snippet.channelTitle === "string" &&
    typeof value.snippet.publishedAt === "string"
  );
}

function parseYouTubeSearchResults(value: unknown): YouTubeVideoResult[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return [];
  }

  return value.items.filter(isYouTubeVideoResult);
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function getUrlPathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function getImageExtension(value: string) {
  const pathname = getUrlPathname(value);
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function normalizeImageSearchQuery(query: string, imageType: string) {
  const trimmed = query.trim();
  const qualifierByType: Record<string, { pattern: RegExp; qualifier: string }> = {
    diagram: {
      pattern: /\b(diagram|labeled|labelled|annotated|cross-section)\b/i,
      qualifier: "labeled diagram",
    },
    photograph: {
      pattern: /\b(photo|photograph|real[- ]world|microscope)\b/i,
      qualifier: "photo",
    },
    illustration: {
      pattern: /\b(illustration|illustrated|drawing|rendering)\b/i,
      qualifier: "illustration",
    },
  };

  const config = qualifierByType[imageType];
  if (!config || config.pattern.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} ${config.qualifier}`;
}

function inferImageTitle(params: {
  imageUrl: string;
  description?: string;
  sourceTitle?: string;
}) {
  if (params.description?.trim()) {
    return params.description.trim();
  }

  if (params.sourceTitle?.trim()) {
    return params.sourceTitle.trim();
  }

  const rawSegment =
    getUrlPathname(params.imageUrl).split("/").filter(Boolean).at(-1) ?? "image";
  const withoutExtension = rawSegment.replace(/\.[a-z0-9]+$/i, "");

  try {
    return decodeURIComponent(withoutExtension).replace(/[-_]+/g, " ").trim() || "image";
  } catch {
    return withoutExtension.replace(/[-_]+/g, " ").trim() || "image";
  }
}

function buildTavilyImageCandidates(input: {
  images: Array<{ url: string; description?: string }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    images?: Array<{ url: string; description?: string }>;
  }>;
}) {
  const seenUrls = new Set<string>();
  const resultScopedCandidates = input.results.flatMap((result) =>
    (result.images ?? []).map((image) => ({
      image,
      sourceTitle: result.title,
      sourceUrl: result.url,
    })),
  );

  const candidatesFromResults = resultScopedCandidates
    .filter(({ image }) => {
      if (!image?.url || seenUrls.has(image.url)) {
        return false;
      }

      seenUrls.add(image.url);
      const extension = getImageExtension(image.url);
      return extension !== "bmp" && extension !== "tif" && extension !== "tiff";
    })
    .map(
      ({ image, sourceTitle, sourceUrl }) =>
        ({
          name: inferImageTitle({
            imageUrl: image.url,
            description: image.description,
            sourceTitle,
          }),
          hostPageDisplayUrl: getUrlHostname(sourceUrl),
          hostPageUrl: sourceUrl,
          contentUrl: image.url,
          width: null,
          height: null,
          encodingFormat: getImageExtension(image.url) || "unknown",
          description: image.description,
        }) satisfies TavilyImageResult,
    );

  if (candidatesFromResults.length > 0) {
    return candidatesFromResults;
  }

  return input.images
    .filter((image) => {
      if (!image?.url || seenUrls.has(image.url)) {
        return false;
      }

      seenUrls.add(image.url);
      const extension = getImageExtension(image.url);
      return extension !== "bmp" && extension !== "tif" && extension !== "tiff";
    })
    .map(
      (image) =>
        ({
          name: inferImageTitle({
            imageUrl: image.url,
            description: image.description,
          }),
          hostPageDisplayUrl: getUrlHostname(image.url),
          hostPageUrl: undefined,
          contentUrl: image.url,
          width: null,
          height: null,
          encodingFormat: getImageExtension(image.url) || "unknown",
          description: image.description,
        }) satisfies TavilyImageResult,
    );
}

export async function searchTavilyImages(
  query: string,
  imageType: string,
): Promise<TavilyImageResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  try {
    const testHooks = getMediaRetrievalTestHooks();
    const response = testHooks.tavilySearch
      ? await testHooks.tavilySearch(query, imageType)
      : await (async () => {
          const requestBody = {
            query: normalizeImageSearchQuery(query, imageType),
            search_depth: "advanced",
            lesson: TAVILY_SEARCH_TOPIC,
            max_results: 10,
            include_images: true,
            include_image_descriptions: true,
          };
          const searchResponse = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "X-Client-Source": "convy-media-retrieval",
            },
            body: JSON.stringify(requestBody),
          });

          if (!searchResponse.ok) {
            throw new Error(
              `Tavily image search failed with status ${searchResponse.status}`,
            );
          }

          return parseTavilySearchResponse(
            parseJsonValue(await searchResponse.text()),
          );
        })();

    return buildTavilyImageCandidates({
      images: response.images,
      results: response.results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Tavily search failure";
    throw new Error(`Tavily image search failed: ${message}`);
  }
}

export async function searchYouTubeVideos(
  query: string,
): Promise<YouTubeVideoResult[]> {
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

  const response = await (getMediaRetrievalTestHooks().youtubeFetch ?? fetch)(
    url.toString(),
  );

  if (!response.ok) {
    throw new Error(`YouTube API failed with status ${response.status}`);
  }

  return parseYouTubeSearchResults(parseJsonValue(await response.text()));
}

