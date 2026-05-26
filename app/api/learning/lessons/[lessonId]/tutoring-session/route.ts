import { GET as getTopicChat } from "../../../topics/[topicId]/chat/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicChat(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
