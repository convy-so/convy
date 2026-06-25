import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { surveyCreationConversations } from "@/shared/db/schema";
import type { ChatMessage } from "@/shared/chat/chat-types";

export async function persistCreationConversation(
  surveyId: string,
  messages: ChatMessage[],
) {
  const [existing] = await getDb()
    .select()
    .from(surveyCreationConversations)
    .where(eq(surveyCreationConversations.surveyId, surveyId));

  const normalizedMessages = messages.map((message) => ({
    id: message.id ?? nanoid(),
    role: message.role,
    content: message.content,
    ...(message.parts ? { parts: message.parts } : {}),
    timestamp: message.timestamp || new Date().toISOString(),
  }));

  if (existing) {
    await getDb()
      .update(surveyCreationConversations)
      .set({ messages: normalizedMessages, updatedAt: new Date() })
      .where(eq(surveyCreationConversations.id, existing.id));
    return;
  }

  await getDb().insert(surveyCreationConversations).values({
    id: nanoid(),
    surveyId,
    messages: normalizedMessages,
    status: "in_progress",
    collectedInfo: {},
    extractedData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
