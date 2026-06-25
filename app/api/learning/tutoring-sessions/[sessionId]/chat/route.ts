import { apiError } from "@/shared/http/api-error";
import { readJsonRequestValue } from "@/shared/http/json";
import { getLearningSessionById } from "@/features/tutoring/public-server";
import { logTutoringDebug, logTutoringError } from "@/features/tutoring/public-server";
import { POST as postTopicChat } from "../../../topics/[topicId]/chat/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  logTutoringDebug("session-chat:forward:start", {
    sessionId,
  });
  const tutoringSession = await getLearningSessionById(sessionId);

  if (!tutoringSession) {
    logTutoringError("session-chat:forward:not-found", new Error("Tutoring session not found."), {
      sessionId,
    });
    return apiError("NOT_FOUND", "Tutoring session not found.");
  }

  const { topicId } = tutoringSession;

  if (tutoringSession.sessionType !== "tutoring" || !topicId) {
    logTutoringError("session-chat:forward:invalid-session", new Error("This route only accepts tutoring session ids."), {
      sessionId,
      sessionType: tutoringSession.sessionType,
      topicId,
    });
    return apiError("VALIDATION_ERROR", "This route only accepts tutoring session ids.");
  }

  const body = await readJsonRequestValue(request);
  const forwardedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({
      ...(typeof body === "object" && body !== null ? body : {}),
      sessionId,
    }),
  });

  logTutoringDebug("session-chat:forward:dispatch", {
    sessionId,
    topicId,
  });

  return postTopicChat(forwardedRequest, {
    params: Promise.resolve({ topicId }),
  });
}
