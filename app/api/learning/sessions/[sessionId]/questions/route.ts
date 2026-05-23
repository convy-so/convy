import { getLearningSessionById } from "@/lib/learning/storage";
import { GET as getTopicQuestions } from "../../../topics/[topicId]/questions/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return getTopicQuestions(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}
