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
