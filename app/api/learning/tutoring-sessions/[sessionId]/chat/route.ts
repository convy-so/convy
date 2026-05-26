import { apiError } from "@/lib/api/error-contract";
import { getLearningSessionById } from "@/lib/learning/storage";
import { POST as postTopicChat } from "../../../topics/[topicId]/chat/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const tutoringSession = await getLearningSessionById(sessionId);

  if (!tutoringSession) {
    return apiError("NOT_FOUND", "Tutoring session not found.");
  }

  if (tutoringSession.sessionType !== "tutoring" || !tutoringSession.topicId) {
    return apiError("VALIDATION_ERROR", "This route only accepts tutoring session ids.");
  }

  const body = await request.json();
  const forwardedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({
      ...(typeof body === "object" && body !== null ? body : {}),
      sessionId,
    }),
  });

  return postTopicChat(forwardedRequest, {
    params: Promise.resolve({ topicId: tutoringSession.topicId! }),
  });
}
