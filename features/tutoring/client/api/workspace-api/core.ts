import { z } from "zod";

import { getFriendlyActionError } from "@/shared/http/friendly-action-error";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function getApiErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if (payload instanceof Error) {
    return payload.message;
  }

  if ("error" in payload) {
    return getFriendlyActionError(payload.error);
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

export async function parseResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorPayload =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error?: { code?: unknown } }).error
        : null;
    throw new ApiClientError(
      getApiErrorMessage(payload) ?? "Request failed",
      typeof errorPayload?.code === "string" ? errorPayload.code : "INTERNAL_ERROR",
      response.status,
    );
  }

  return schema.parse(payload);
}
