import { getLearningSessionById } from "@/lib/learning/storage";
import {
  GET as getTopicChat,
  POST as postTopicChat,
} from "../../../topics/[topicId]/chat/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return getTopicChat(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return postTopicChat(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}
