/**
 * API functions for survey-related data fetching
 */

import { z } from "zod";
import { getFriendlyActionError } from "@/lib/action-ux";

export class SurveyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SurveyApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    const payload = await response.json().catch(() => null);

    if (isRecord(payload)) {
      if ("error" in payload) {
        return getFriendlyActionError(payload.error);
      }

      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
  }

  const text = await response.text().catch(() => "");
  return text || fallback;
}

async function parseJsonOrThrow<T>(
  response: Response,
  fallback: string,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!response.ok) {
    const message = await getErrorMessage(response, fallback);
    throw new SurveyApiError(message, response.status);
  }

  const payload = await response.json();
  return schema.parse(payload);
}

const surveyBriefSchema = z
  .object({
    researchGoal: z.string().optional(),
    learningContext: z.string().optional(),
    audienceDefinition: z.string().optional(),
    tone: z.string().optional(),
  })
  .passthrough();

const surveyListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  brief: surveyBriefSchema.nullish(),
  coreObjective: z.string().nullish(),
  status: z.string(),
  deliveryMode: z.enum(["link", "classroom_assigned"]),
  classroomId: z.string().nullish(),
  classroomTitle: z.string().nullish(),
  shareableLink: z.string().nullish(),
  responses: z.number(),
  completionRate: z.number(),
  createdAt: z.string(),
  lastResponse: z.string(),
  isOwner: z.boolean(),
  isVoice: z.boolean(),
  sharedBy: z.string().nullish(),
  role: z.enum(["owner", "none"]).optional(),
  creatorName: z.string().nullish(),
  accessLevel: z.enum(["owner", "none"]),
  canOpen: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  isLocked: z.boolean(),
  folderId: z.string().nullish(),
  programId: z.string().nullish(),
  briefStatus: z.string().optional(),
});

const surveyListResponseSchema = z.object({
  surveys: z.array(surveyListItemSchema),
});

const surveyPermissionSchema = z.object({
  surveyId: z.string(),
  ownerId: z.string(),
  accessLevel: z.enum(["owner", "none"]),
  isSurveyCreator: z.boolean(),
  isSurveyEditor: z.boolean(),
  canDiscover: z.boolean(),
  canView: z.boolean(),
  canComment: z.boolean(),
  canEdit: z.boolean(),
  canPublish: z.boolean(),
  canDelete: z.boolean(),
});

const surveyDetailsResponseSchema = z.object({
  survey: z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    description: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).nullable().optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    coreObjective: z.string().nullable().optional(),
    programId: z.string().nullable().optional(),
    brief: surveyBriefSchema.nullish(),
    tone: z.string().nullable().optional(),
    customSlug: z.string().nullable().optional(),
    shareableLink: z.string().nullable().optional(),
    shareableUrl: z.string().nullable().optional(),
    participantLimit: z.number(),
    currentParticipants: z.number(),
    deliveryMode: z.enum(["link", "classroom_assigned"]),
    classroomId: z.string().nullable().optional(),
    classroomTitle: z.string().nullable().optional(),
    requiredQuestions: z.array(z.string()).nullish(),
    metrics: z.array(z.string()).nullish(),
    language: z.string().optional(),
    isVoice: z.boolean().optional(),
    media: z.unknown().optional(),
    sampleConversationCount: z.number().optional(),
    userId: z.string(),
    editors: z.array(z.string()),
    permission: surveyPermissionSchema,
  }),
  stats: z.object({
    totalResponses: z.number(),
    completedResponses: z.number(),
    completionRate: z.number(),
    avgDuration: z.string(),
  }),
  recentResponses: z.array(
    z.object({
      id: z.string(),
      participantId: z.string().nullable().optional(),
      completed: z.boolean(),
      completedAt: z.string().nullable(),
      createdAt: z.string().nullable().optional(),
    }),
  ),
});

const surveyResponsesResponseSchema = z.object({
  responses: z.array(
    z.object({
      id: z.string(),
      participantId: z.string(),
      status: z.enum(["completed", "abandoned"]),
      completedAt: z.string().nullable(),
      createdAt: z.string().nullable(),
      duration: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative"]).nullable(),
      keyInsights: z.array(z.string()),
      messageCount: z.number(),
      summary: z.string().optional(),
      sentimentScore: z.number().optional(),
    }),
  ),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type SurveyListItem = z.infer<typeof surveyListItemSchema>;
export type SurveyDetailsResponse = z.infer<typeof surveyDetailsResponseSchema>;
export type SurveyResponsesResponse = z.infer<typeof surveyResponsesResponseSchema>;

export const surveyDraftCreateResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  deliveryMode: z.enum(["link", "classroom_assigned"]),
  classroomId: z.string().nullable().optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.string(),
        content: z.string().optional(),
        parts: z.array(z.unknown()).optional(),
        timestamp: z.string().optional(),
      }),
    )
    .optional(),
});

export async function fetchSurveys(): Promise<SurveyListItem[]> {
  const response = await fetch("/api/surveys", { credentials: "include" });
  const data = await parseJsonOrThrow(
    response,
    "Failed to fetch surveys",
    surveyListResponseSchema,
  );
  return data.surveys;
}

export async function fetchSurveyDetails(
  surveyId: string,
): Promise<SurveyDetailsResponse> {
  const response = await fetch(`/api/surveys/${surveyId}/details`, {
    credentials: "include",
  });
  return parseJsonOrThrow(
    response,
    "Failed to fetch survey details",
    surveyDetailsResponseSchema,
  );
}

export async function fetchSurveyResponses(
  surveyId: string,
  page: number,
  limit: number,
  status: string,
): Promise<SurveyResponsesResponse> {
  const response = await fetch(
    `/api/surveys/${surveyId}/responses?page=${page}&limit=${limit}&status=${status}`,
    { credentials: "include" },
  );
  return parseJsonOrThrow(
    response,
    "Failed to fetch responses",
    surveyResponsesResponseSchema,
  );
}

export async function fetchSurveyAnalytics(surveyId: string) {
  const response = await fetch(
    `/api/surveys/${surveyId}/analytics?format=full`,
    { credentials: "include" },
  );
  return parseJsonOrThrow(
    response,
    "Failed to fetch analytics",
    z.unknown(),
  );
}

export async function fetchSurveyExtraction(surveyId: string) {
  const response = await fetch(`/api/surveys/${surveyId}/create`, {
    credentials: "include",
  });
  return parseJsonOrThrow(
    response,
    "Failed to fetch extraction data",
    z.unknown(),
  );
}

