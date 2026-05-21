import {
  GET as getTopicChat,
  POST as postTopicChat,
} from "../../../topics/[topicId]/chat/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return getTopicChat(request, {
    params: Promise.resolve({ topicId: sessionId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return postTopicChat(request, {
    params: Promise.resolve({ topicId: sessionId }),
  });
}
