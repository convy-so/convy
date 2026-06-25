import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { surveyConversations } from "@/shared/db/schema";
import {
  ensureSession,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/features/surveys/server/education/storage";
import { createInitialSessionState } from "@/features/surveys/server/education/conducting-runtime";
import {
  admitParticipantOnFirstUserTurn,
  buildCanonicalConversationTurn,
  type RespondentLanguage,
} from "@/features/surveys/server/respondent-conversation";
import {
  RESPONDENT_RESUME_QUERY_PARAM,
  resolveRespondentAccess,
} from "@/features/privacy/public-server";
import { getClientIP } from "@/shared/security/client-ip";
import { 
  resolveClassroomAssignedAccess, 
  respondWithExistingConversation, 
  createNewConversation
} from "@/features/surveys/server/respondent-session-service";
import { processRespondentTurn } from "@/features/surveys/server/respondent-runtime-service";
import { fetchActiveSurveyByShareableLink } from "@/features/surveys/server/public-survey-access";
import { nanoid } from "nanoid";
import { normalizeSurveyLanguage } from "@/shared/surveys/constants";
import { requireValue } from "@/shared/utils/collections";
import { z } from "zod";

function getRequestedLanguage(language: unknown): RespondentLanguage {
  return normalizeSurveyLanguage(language);
}

const respondentRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  language: z.string().optional(),
  context: z
    .object({
      conversationId: z.string().min(1).optional(),
    })
    .optional(),
  messages: z.array(z.unknown()).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const { searchParams } = new URL(request.url);
    const language = getRequestedLanguage(searchParams.get("language"));
    const resumeToken = searchParams.get(RESPONDENT_RESUME_QUERY_PARAM);

    const surveyResult = await fetchActiveSurveyByShareableLink(shareableLink);
    if ("error" in surveyResult) { return apiError("NOT_FOUND", surveyResult.error.message); }
    const survey = surveyResult.survey;

    const access = await resolveClassroomAssignedAccess(survey);
    if (!access.success) {
      return access.response;
    }

    const authorizedAccess = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId: survey.id,
      explicitToken: resumeToken,
      sessionAllowedScopes: ["respondent_session"],
      explicitAllowedScopes: ["respondent_resume"],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });
    
    const existingConversationId = authorizedAccess?.conversationId ?? null;

    if (existingConversationId) {
      const existingConversation = await getDb().query.surveyConversations.findFirst({
        where: eq(surveyConversations.id, existingConversationId),
      });

      if (existingConversation && existingConversation.surveyId === survey.id) {
        if (access.data.mode === "classroom_assigned" && existingConversation.participantId !== access.data.classroomStudent.id) { return apiError("UNAUTHORIZED", "Unauthorized"); }

        return respondWithExistingConversation({
          request,
          survey,
          conversation: existingConversation,
        });
      }
    }

    if (survey.deliveryMode !== "classroom_assigned" && survey.currentParticipants >= survey.participantLimit) { return apiError("UNAUTHORIZED", "Survey has reached its participant limit"); }

    if (access.data.mode === "classroom_assigned") {
      const existingClassroomConversation = await getDb().query.surveyConversations.findFirst({
        where: and(
          eq(surveyConversations.surveyId, survey.id),
          eq(surveyConversations.participantId, access.data.classroomStudent.id),
        ),
        orderBy: desc(surveyConversations.updatedAt),
      });

      if (existingClassroomConversation) {
        return respondWithExistingConversation({
          request,
          survey,
          conversation: existingClassroomConversation,
        });
      }
    }

    return await createNewConversation({
      request,
      survey,
      access: access.data,
      language,
    });
  } catch (error) { return apiUnhandledError(error, "Internal server error", "/api/surveys/respond/[shareableLink]:get"); }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const requestPayload = respondentRequestSchema.parse(await req.json());
    const { shareableLink } = await params;

    const surveyResult = await fetchActiveSurveyByShareableLink(shareableLink);
    if ("error" in surveyResult) { return apiError("NOT_FOUND", surveyResult.error.message); }
    const survey = surveyResult.survey;

    const conversationId = requestPayload.conversationId ?? requestPayload.context?.conversationId;
    if (!conversationId) { return apiError("VALIDATION_ERROR", "Conversation ID is required"); }

    const [conversation, briefRow, planRow] = await Promise.all([
      getDb().query.surveyConversations.findFirst({
        where: eq(surveyConversations.id, conversationId),
      }),
      getResearchBrief(survey.id),
      getActiveCoveragePlan(survey.id),
    ]);
    
    const access = await resolveClassroomAssignedAccess(survey);
    if (!access.success) {
      return access.response;
    }

    if (!conversation || conversation.surveyId !== survey.id) { return apiError("NOT_FOUND", "Conversation not found"); }
    
    if (access.data.mode === "classroom_assigned" && conversation.participantId !== access.data.classroomStudent.id) { return apiError("UNAUTHORIZED", "Unauthorized"); }
    
    const respondentAccess = await resolveRespondentAccess({
      cookieHeader: req.headers.get("cookie"),
      surveyId: survey.id,
      conversationId: conversation.id,
      sessionAllowedScopes: ["respondent_session"],
      clientIp: getClientIP(req),
      userAgent: req.headers.get("user-agent"),
    });
    
    if (!respondentAccess) { return apiError("UNAUTHORIZED", "Unauthorized"); }
    
    if (!briefRow || !planRow) { return apiError("VALIDATION_ERROR", "This survey does not have an approved education brief yet."); }

    const canonicalTurn = buildCanonicalConversationTurn({
      storedMessages: Array.isArray(conversation.rawConversation) ? conversation.rawConversation : [],
      incomingMessages: Array.isArray(requestPayload.messages) ? requestPayload.messages : [],
    });

    if (!canonicalTurn.hasNewUserTurn) { return apiError("VALIDATION_ERROR", "No new user turn detected"); }

    const firstUserTurn = !canonicalTurn.storedMessages.some(
      (message) => message.role === "user",
    );

    if (firstUserTurn) {
      const admission = await admitParticipantOnFirstUserTurn({
        surveyId: survey.id,
        conversationId: conversation.id,
        enforceParticipantLimit: survey.deliveryMode !== "classroom_assigned",
      });

      if (!admission.allowed) { return apiError("UNAUTHORIZED", "Survey has reached participant limit"); }
    }

    const language = getRequestedLanguage(requestPayload.language);
    let sessionRow = await getSessionBySourceId(conversation.id);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId: survey.id,
        sessionType: "live",
        sourceConversationId: conversation.id,
        language: getRequestedLanguage(requestPayload.language ?? survey.language),
        respondentId: conversation.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: getRequestedLanguage(requestPayload.language ?? survey.language),
          coveragePlan: planRow.plan,
        }),
      });
    }
    const readySessionRow = requireValue(
      sessionRow,
      `Failed to resolve respondent session for conversation ${conversation.id}`,
    );

    return await processRespondentTurn({
      survey,
      conversation,
      brief: briefRow,
      coveragePlan: planRow,
      sessionRow: readySessionRow,
      canonicalTurn,
      language,
    });
  } catch (error) { if (error instanceof z.ZodError) { return apiError("VALIDATION_ERROR", "Invalid request payload", { details: { issues: error.issues } }); } return apiUnhandledError(error, "Internal server error", "/api/surveys/respond/[shareableLink]:post"); }
}
