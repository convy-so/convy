import { z } from "zod";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("media-retrieval");

const rerankSchema = z.object({
  index: z.number(),
  reason: z.string(),
});

interface BingImageResult {
  name: string;
  hostPageDisplayUrl: string;
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
): Promise<{ index: number; reason: string }> {
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
    return await generateStructuredOutput({
      schema: rerankSchema,
      prompt,
      system: "You are a helpful educational assistant selecting media.",
    });
  } catch (error) {
    log.error("Image reranking failed", serializeError(error));
    return { index: -1, reason: "Reranking failed" };
  }
}

export async function rerankVideos(
  concept: string,
  studentContext: string,
  candidates: YouTubeVideoResult[]
): Promise<{ index: number; reason: string }> {
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
    return await generateStructuredOutput({
      schema: rerankSchema,
      prompt,
      system: "You are a helpful educational assistant selecting media.",
    });
  } catch (error) {
    log.error("Video reranking failed", serializeError(error));
    return { index: -1, reason: "Reranking failed" };
  }
}

export async function executeImageSearchPipeline(
  query: string,
  imageType: string,
  concept: string,
  studentContext: string
) {
  try {
    const candidates = await searchBingImages(query, imageType);
    if (candidates.length === 0) {
      return { success: false, reason: "No images found." };
    }

    const { index, reason } = await rerankImages(concept, studentContext, candidates);
    if (index === -1 || !candidates[index]) {
      return { success: false, reason: "No suitable image found after reranking." };
    }

    const selected = candidates[index];
    return {
      success: true,
      url: selected.contentUrl,
      reason,
      mediaType: "image",
    };
  } catch (error) {
    log.error("Image search pipeline failed", serializeError(error));
    return { success: false, reason: "Pipeline error" };
  }
}

export async function executeVideoSearchPipeline(
  query: string,
  concept: string,
  studentContext: string
) {
  try {
    const candidates = await searchYouTubeVideos(query);
    if (candidates.length === 0) {
      return { success: false, reason: "No videos found." };
    }

    const { index, reason } = await rerankVideos(concept, studentContext, candidates);
    if (index === -1 || !candidates[index]) {
      return { success: false, reason: "No suitable video found after reranking." };
    }

    const selected = candidates[index];
    return {
      success: true,
      url: "https://www.youtube.com/embed/" + selected.id.videoId,
      reason,
      mediaType: "video",
    };
  } catch (error) {
    log.error("Video search pipeline failed", serializeError(error));
    return { success: false, reason: "Pipeline error" };
  }
}
