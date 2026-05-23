export type FrameworkVersionLiveRef = {
  id: string;
  version: number;
  status: string;
  seedSource?: string | null;
};

/** A version is live only when explicitly published and still pointed to by the framework row. */
export function resolveLiveFrameworkVersion(
  activeVersionId: string | null | undefined,
  versions: FrameworkVersionLiveRef[],
): FrameworkVersionLiveRef | null {
  if (!activeVersionId) {
    return null;
  }

  const candidate = versions.find((version) => version.id === activeVersionId);
  if (!candidate || candidate.status !== "published") {
    return null;
  }

  return candidate;
}

export function isAutoSeededPublishedPlaceholder(version: {
  seedSource?: string | null;
  framework?: { markdownContent?: string };
}): boolean {
  if (version.seedSource !== "deep_default") {
    return false;
  }

  const markdown = version.framework?.markdownContent?.trim() ?? "";
  return markdown.length === 0;
}
