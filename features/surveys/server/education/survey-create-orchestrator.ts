import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveyCreationConversations, surveys } from "@/shared/db/schema";
import { toPersistedUIChatMessages } from "@/shared/chat/chat-ui-messages";
import { type ChatMessage, type ExtractedData } from "@/shared/chat/chat-types";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
} from "@/features/surveys/server/collaboration-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeExtractedData(value: unknown): ExtractedData {
  return isRecord(value) ? value : {};
}

export function normalizeCreationMessages(messages: readonly unknown[]): ChatMessage[] {
  return toPersistedUIChatMessages(messages, ["user", "assistant", "system", "tool"]).map(
    (message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      parts: message.parts,
      timestamp: message.timestamp,
    }),
  );
}

export async function ensureCreationLease(input: {
  surveyId: string;
  userId: string;
  sessionId?: string | null;
  leaseToken?: string | null;
  force?: boolean;
}) {
  const activeLease = await getActiveSurveyLease(input.surveyId, "creation");

  if (
    activeLease &&
    activeLease.holderUserId !== input.userId &&
    (!input.leaseToken || input.leaseToken !== activeLease.leaseToken)
  ) {
    return { ok: false as const, error: "LEASE_CONFLICT", lease: activeLease };
  }

  if (
    activeLease &&
    activeLease.holderUserId === input.userId &&
    input.leaseToken === activeLease.leaseToken
  ) {
    return { ok: true as const, lease: activeLease };
  }

  return acquireSurveyLease({
    surveyId: input.surveyId,
    stage: "creation",
    userId: input.userId,
    sessionId: input.sessionId,
    force: input.force,
  });
}

export async function loadSurveyCreationContext(surveyId: string) {
  const [survey, existingConversation] = await Promise.all([
    getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId))
      .then((rows) => rows[0]),
  ]);

  return { survey, existingConversation };
}
