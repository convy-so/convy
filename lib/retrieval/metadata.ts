import { createHash } from "node:crypto";

type HeaderValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

function formatHeaderValue(value: HeaderValue) {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (item == null ? null : String(item).trim()))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildRetrievalHeader(
  entries: Array<{ label: string; value: HeaderValue }>,
) {
  const lines = entries
    .map((entry) => {
      const value = formatHeaderValue(entry.value);
      return value ? `${entry.label}: ${value}` : null;
    })
    .filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export function buildRetrievalContent(params: {
  headerEntries: Array<{ label: string; value: HeaderValue }>;
  rawContent: string;
}) {
  const header = buildRetrievalHeader(params.headerEntries);
  const body = params.rawContent.trim();

  if (!header) {
    return body;
  }

  if (!body) {
    return header;
  }

  return `${header}\n\n${body}`;
}

export function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
