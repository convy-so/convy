import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { surveyConversations } from "@/db/schema";
import {
  ensureSession,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/lib/education/storage";
import { createInitialSessionState } from "@/lib/education/conducting-runtime";
import {
  admitParticipantOnFirstUserTurn,
  buildCanonicalConversationTurn,
  type RespondentLanguage,
} from "@/lib/respondent-conversation";
import {
  RESPONDENT_RESUME_QUERY_PARAM,
  resolveRespondentAccess,
} from "@/lib/privacy/respondent";
import { getClientIP } from "@/lib/ratelimit";
import { 
  resolveClassroomAssignedAccess, 
  respondWithExistingConversation, 
  createNewConversation,
  jsonNoStore 
} from "@/lib/surveys/respondent-session-service";
import { processRespondentTurn } from "@/lib/surveys/respondent-runtime-service";
import { fetchActiveSurveyByShareableLink } from "@/lib/surveys/public-survey-access";
import { nanoid } from "nanoid";
import { z } from "zod";

const supportedRespondentLanguages = new Set<RespondentLanguage>([
  "en",
  "fr",
  "de",
  "es",
  "it",
]);

function getRequestedLanguage(language: unknown): RespondentLanguage {
  if (typeof language === "string" && supportedRespondentLanguages.has(language as RespondentLanguage)) {
    return language as RespondentLanguage;
  }

  return "en";
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
    if ("error" in surveyResult) {
      return jsonNoStore({ error: surveyResult.error.message }, { status: surveyResult.error.status });
    }
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
        if (
          access.data.mode === "classroom_assigned" &&
          existingConversation.participantId !== access.data.classroomStudent.id
        ) {
          return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
        }

        return respondWithExistingConversation({
          request,
          survey,
          conversation: existingConversation,
        });
      }
    }

    if (
      survey.deliveryMode !== "classroom_assigned" &&
      survey.currentParticipants >= survey.participantLimit
    ) {
      return jsonNoStore(
        { error: "Survey has reached its participant limit" },
        { status: 403 },
      );
    }

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
  } catch (error) {
    console.error("[Respondent GET] Error:", error);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const requestPayload = respondentRequestSchema.parse(await req.json());
    const { shareableLink } = await params;

    const surveyResult = await fetchActiveSurveyByShareableLink(shareableLink);
    if ("error" in surveyResult) {
      return jsonNoStore({ error: surveyResult.error.message }, { status: surveyResult.error.status });
    }
    const survey = surveyResult.survey;

    const conversationId = requestPayload.conversationId ?? requestPayload.context?.conversationId;
    if (!conversationId) {
      return jsonNoStore({ error: "Conversation ID is required" }, { status: 400 });
    }

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

    if (!conversation || conversation.surveyId !== survey.id) {
      return jsonNoStore({ error: "Conversation not found" }, { status: 404 });
    }
    
    if (
      access.data.mode === "classroom_assigned" &&
      conversation.participantId !== access.data.classroomStudent.id
    ) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }
    
    const respondentAccess = await resolveRespondentAccess({
      cookieHeader: req.headers.get("cookie"),
      surveyId: survey.id,
      conversationId: conversation.id,
      sessionAllowedScopes: ["respondent_session"],
      clientIp: getClientIP(req),
      userAgent: req.headers.get("user-agent"),
    });
    
    if (!respondentAccess) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }
    
    if (!briefRow || !planRow) {
      return jsonNoStore(
        { error: "This survey does not have an approved education brief yet." },
        { status: 400 },
      );
    }

    const canonicalTurn = buildCanonicalConversationTurn({
      storedMessages: Array.isArray(conversation.rawConversation) ? conversation.rawConversation : [],
      incomingMessages: Array.isArray(requestPayload.messages) ? requestPayload.messages : [],
    });

    if (!canonicalTurn.hasNewUserTurn) {
       // Handled by client replay usually, but let's be safe
       return jsonNoStore({ error: "No new user turn detected" }, { status: 400 });
    }

    const firstUserTurn = !conversation.rawConversation || 
      !(conversation.rawConversation as Array<{ role?: string }>).some(
        (m) => m.role === "user",
      );

    if (firstUserTurn) {
      const admission = await admitParticipantOnFirstUserTurn({
        surveyId: survey.id,
        conversationId: conversation.id,
        enforceParticipantLimit: survey.deliveryMode !== "classroom_assigned",
      });

      if (!admission.allowed) {
        return jsonNoStore({ error: "Survey has reached participant limit" }, { status: 403 });
      }
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

    return await processRespondentTurn({
      survey,
      conversation,
      brief: briefRow,
      coveragePlan: planRow,
      sessionRow,
      canonicalTurn,
      language,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonNoStore({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }

    console.error("[Respondent POST] Error:", error);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}
