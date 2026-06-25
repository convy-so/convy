import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/shared/db";
import { classroomStudents, surveys, surveyConversations } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getRespondentSessionCookieName, getRespondentSessionCookieOptions, issueRespondentSessionToken } from "@/features/privacy/public-server";
import { getClientIP } from "@/shared/security/client-ip";
import { buildRespondentVoiceGreeting, getUsableRespondentMessages, type RespondentLanguage } from "@/features/surveys/server/respondent-conversation";
import { toVisibleConversationMessages, toPersistedUIChatMessages } from "@/shared/chat/chat-ui-messages";
import type { ChatMessage } from "@/shared/chat/chat-types";
import { nanoid } from "nanoid";
import {
  SURVEY_DEFAULTS,
  SURVEY_DELIVERY_MODE,
  normalizeSurveyLanguage,
} from "@/shared/surveys/constants";

export type ClassroomAssignedAccess =
  | {
      mode: typeof SURVEY_DELIVERY_MODE.CLASSROOM_ASSIGNED;
      classroomStudent: {
        id: string;
        userId: string | null;
      };
    }
  | { mode: typeof SURVEY_DELIVERY_MODE.LINK };

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function resolveClassroomAssignedAccess(
  survey: typeof surveys.$inferSelect,
): Promise<
  | { success: true; data: ClassroomAssignedAccess }
  | { success: false; response: NextResponse }
> {
  if (survey.deliveryMode !== SURVEY_DELIVERY_MODE.CLASSROOM_ASSIGNED) {
    return {
      success: true,
      data: { mode: SURVEY_DELIVERY_MODE.LINK },
    };
  }

  if (!survey.classroomId) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "Classroom-assigned survey is misconfigured" },
        { status: 400 },
      ),
    };
  }

  const session = await getVerifiedSession().catch(() => null);
  if (!session) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "Sign in with your classroom account to access this survey" },
        { status: 403 },
      ),
    };
  }

  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, survey.classroomId),
      eq(classroomStudents.userId, session.user.id),
    ),
    columns: {
      id: true,
      userId: true,
    },
  });

  if (!classroomStudent) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "You do not have access to this classroom survey" },
        { status: 403 },
      ),
    };
  }

  return {
      success: true,
      data: {
        mode: SURVEY_DELIVERY_MODE.CLASSROOM_ASSIGNED,
        classroomStudent,
      },
  };
}

export function buildSurveyResponsePayload(survey: typeof surveys.$inferSelect) {
  return {
    id: survey.id,
    title: survey.title,
    objective: survey.coreObjective,
    tone: survey.tone,
    requiredQuestions: survey.requiredQuestions || [],
    isVoice: survey.isVoice,
    programId: survey.programId,
  };
}

export async function respondWithExistingConversation(input: {
  request: Request;
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
}) {
  const respondentSessionToken = await issueRespondentSessionToken({
    surveyId: input.survey.id,
    conversationId: input.conversation.id,
    participantId: input.conversation.participantId,
    ipAddress: getClientIP(input.request),
    userAgent: input.request.headers.get("user-agent"),
  });
  const usableMessages = getUsableRespondentMessages(
    toVisibleConversationMessages(
      toPersistedUIChatMessages(Array.isArray(input.conversation.rawConversation) ? input.conversation.rawConversation : [], ["user", "assistant"]),
    ),
    input.survey.isVoice,
  );

  if (input.conversation.completed) {
    const completedResponse = jsonNoStore({
      completed: true,
      survey: {
        id: input.survey.id,
        title: input.survey.title,
        isVoice: input.survey.isVoice,
      },
      conversationId: input.conversation.id,
      participantId: input.conversation.participantId,
    });
    completedResponse.cookies.set(
      getRespondentSessionCookieName(input.survey.id),
      respondentSessionToken,
      getRespondentSessionCookieOptions(),
    );
    return completedResponse;
  }

  const response = jsonNoStore({
    survey: buildSurveyResponsePayload(input.survey),
    conversationId: input.conversation.id,
    participantId: input.conversation.participantId,
    messages: usableMessages,
  });
  response.cookies.set(
    getRespondentSessionCookieName(input.survey.id),
    respondentSessionToken,
    getRespondentSessionCookieOptions(),
  );
  return response;
}

export async function createNewConversation(input: {
  request: Request;
  survey: typeof surveys.$inferSelect;
  access: ClassroomAssignedAccess;
  language?: RespondentLanguage;
}) {
  const conversationId = nanoid();
  const participantId =
    input.access.mode === "classroom_assigned"
      
      ? input.access.classroomStudent.id
      : nanoid(8);
  
  const respondentSessionToken = await issueRespondentSessionToken({
    surveyId: input.survey.id,
    conversationId,
    participantId,
    ipAddress: getClientIP(input.request),
    userAgent: input.request.headers.get("user-agent"),
  });

  const greetingText = buildRespondentVoiceGreeting({
    language: normalizeSurveyLanguage(
      input.language ?? input.survey.language,
      SURVEY_DEFAULTS.language,
    ),
    surveyTitle: input.survey.title,
    brief: null,
  });

  const greetingMessage: ChatMessage | null = input.survey.isVoice
    ? null
    : {
        id: nanoid(),
        role: "assistant",
        content: greetingText,
        parts: [{ type: "text", text: greetingText }],
        timestamp: new Date().toISOString(),
      };

  await getDb().insert(surveyConversations).values({
    id: conversationId,
    surveyId: input.survey.id,
    participantId,
    rawConversation: greetingMessage ? [greetingMessage] : [],
    completed: SURVEY_DEFAULTS.confirmed,
    originalLanguage: normalizeSurveyLanguage(
      input.language ?? input.survey.language,
      SURVEY_DEFAULTS.language,
    ),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const response = jsonNoStore({
    survey: buildSurveyResponsePayload(input.survey),
    conversationId,
    participantId,
    messages: greetingMessage ? [greetingMessage] : [],
  });
  
  response.cookies.set(
    getRespondentSessionCookieName(input.survey.id),
    respondentSessionToken,
    getRespondentSessionCookieOptions(),
  );
  
  return response;
}
