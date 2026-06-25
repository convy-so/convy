import { sanitizeUserInput } from "@/shared/ai/sanitization";
import { renderStrictScopePolicyInstructions } from "@/shared/ai/scope-policy";
import type { ChatMessage } from "@/shared/chat/chat-types";
import type { UIMessage } from "ai";

export function countScopeRedirects(messages: ChatMessage[]) {
  return messages.filter(
    (message) =>
      message.role === "assistant" &&
      /let's stay focused on|we need to stay on the current objective/i.test(
        message.content,
      ),
  ).length;
}

export function sanitizeRespondentMessages(
  messages: readonly UIMessage[],
): UIMessage[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        ...message,
        parts: message.parts?.map((part) =>
          part.type === "text"
            ? {
                ...part,
                text: sanitizeUserInput(part.text, {
                  maxLength: 2000,
                  allowNewlines: true,
                }),
              }
            : part,
        ),
      };
    }
    return message;
  });
}

export function buildRespondentSystemPrompt(params: {
  dynamicSystemPrompt: string;
  objective: string;
  activeTopic: string;
}) {
  return `${params.dynamicSystemPrompt}

${renderStrictScopePolicyInstructions({
  objective: params.objective,
  currentPhase: "live respondent interview",
  activeTopic: params.activeTopic,
  allowedDetours: [
    "brief clarification of the current question",
    "asking what a current term means",
    "answering in another supported language",
  ],
})}

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;
}
