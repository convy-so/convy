import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getTimeBasedGreeting } from "@/lib/greetings";
import type { ResearchBrief } from "@/lib/education/types";

type ConversationMessage = {
  role: "user" | "assistant" | "system" | "tool" | "data";
  content: string;
};

type SurveyMediaLike = {
  description?: string | null;
  altText?: string | null;
  contextForUse?: string | null;
};

export type RespondentLanguage = "en" | "fr" | "de" | "es" | "it";

export function hasUserTurn<T extends ConversationMessage>(
  messages: T[] = [],
): boolean {
  return messages.some((message) => message.role === "user");
}

export function isLegacyVoiceBootstrapConversation<T extends ConversationMessage>(
  messages: T[] = [],
  isVoiceSurvey: boolean,
): boolean {
  if (!isVoiceSurvey || messages.length !== 1) return false;

  const [firstMessage] = messages;
  return firstMessage?.role === "assistant" && !hasUserTurn(messages);
}

export function getUsableRespondentMessages<T extends ConversationMessage>(
  messages: T[] = [],
  isVoiceSurvey: boolean,
): T[] {
  return isLegacyVoiceBootstrapConversation(messages, isVoiceSurvey)
    ? []
    : messages;
}

export function buildRespondentVoiceGreeting(input: {
  language: RespondentLanguage;
  surveyTitle?: string | null;
  brief?: ResearchBrief | null;
}): string {
  const topic =
    input.brief?.requiredTopics.find((item) => item.trim().length > 0) ||
    input.surveyTitle?.trim() ||
    "this topic";
  const greeting = getTimeBasedGreeting("response", input.language);

  switch (input.language) {
    case "fr":
      return `${greeting} Pour commencer, pouvez-vous me parler de votre experience avec ${topic} ?`;
    case "de":
      return `${greeting} Zum Einstieg: Konnten Sie mir etwas ueber Ihre Erfahrungen mit ${topic} erzaehlen?`;
    case "es":
      return `${greeting} Para empezar, podrias contarme sobre tu experiencia con ${topic}?`;
    case "it":
      return `${greeting} Per iniziare, potresti raccontarmi la tua esperienza con ${topic}?`;
    case "en":
    default:
      return `${greeting} To start, could you tell me about your experience with ${topic}?`;
  }
}

export function buildVoiceAgentKeyterms(input: {
  surveyTitle?: string | null;
  requiredQuestions?: string[] | null;
  media?: SurveyMediaLike[] | null;
  brief?: ResearchBrief | null;
}): string[] {
  const candidates = [
    input.surveyTitle,
    ...(input.requiredQuestions || []),
    ...(input.brief?.requiredTopics || []),
    ...(input.media || []).flatMap((item) => [
      item.description,
      item.altText,
      item.contextForUse,
    ]),
  ];

  const keyterms: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate) continue;

    for (const rawTerm of candidate.split(/[\n,;|/]+/)) {
      const term = rawTerm.replace(/\s+/g, " ").trim();
      if (term.length < 2 || term.length > 80) continue;

      const normalized = term.toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      keyterms.push(term);

      if (keyterms.length >= 100) {
        return keyterms;
      }
    }
  }

  return keyterms;
}

export async function admitParticipantOnFirstUserTurn(input: {
  surveyId: string;
  conversationId: string;
  enforceParticipantLimit?: boolean;
}): Promise<{
  allowed: boolean;
  newlyAdmitted: boolean;
}> {
  return await getDb().transaction(async (tx) => {
    const conversationResult = await tx.execute(
      sql<{ raw_conversation: ConversationMessage[] }>`
        select raw_conversation
        from survey_conversations
        where id = ${input.conversationId}
        for update
      `,
    );
    const rawConversation = conversationResult.rows[0]?.raw_conversation ?? [];

    if (hasUserTurn(Array.isArray(rawConversation) ? rawConversation : [])) {
      return { allowed: true, newlyAdmitted: false };
    }

    const updatedSurvey = input.enforceParticipantLimit === false
      ? await tx
          .update(surveys)
          .set({
            currentParticipants: sql`${surveys.currentParticipants} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(surveys.id, input.surveyId))
          .returning({ id: surveys.id })
      : await tx
          .update(surveys)
          .set({
            currentParticipants: sql`${surveys.currentParticipants} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(surveys.id, input.surveyId),
              sql`${surveys.currentParticipants} < ${surveys.participantLimit}`,
            ),
          )
          .returning({ id: surveys.id });

    if (updatedSurvey.length === 0) {
      return { allowed: false, newlyAdmitted: false };
    }

    return { allowed: true, newlyAdmitted: true };
  });
}
