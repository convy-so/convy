import { type MediaRetrievalTestHooks } from "./media-retrieval-contract";

const mediaRetrievalTestHooks: MediaRetrievalTestHooks = {
  tavilySearch: null,
  youtubeFetch: null,
  generateStructuredOutput: null,
};

export function getMediaRetrievalTestHooks() {
  return mediaRetrievalTestHooks;
}

export function configureMediaRetrievalTestHooks(
  hooks: Partial<MediaRetrievalTestHooks>,
) {
  if ("tavilySearch" in hooks) {
    mediaRetrievalTestHooks.tavilySearch = hooks.tavilySearch ?? null;
  }
  if ("youtubeFetch" in hooks) {
    mediaRetrievalTestHooks.youtubeFetch = hooks.youtubeFetch ?? null;
  }
  if ("generateStructuredOutput" in hooks) {
    mediaRetrievalTestHooks.generateStructuredOutput =
      hooks.generateStructuredOutput ?? null;
  }
}

export function resetMediaRetrievalTestHooks() {
  mediaRetrievalTestHooks.tavilySearch = null;
  mediaRetrievalTestHooks.youtubeFetch = null;
  mediaRetrievalTestHooks.generateStructuredOutput = null;
}
