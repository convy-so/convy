export function parseJsonValue(raw: string): unknown {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function readJsonRequestValue(
  request: Request,
): Promise<unknown> {
  return parseJsonValue(await request.text());
}

export async function readJsonResponseValue(
  response: Response,
): Promise<unknown> {
  return parseJsonValue(await response.text());
}
