import { getLearningSessionById } from "@/lib/learning/storage";
import { GET as getTopicReports } from "../../../topics/[topicId]/reports/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return getTopicReports(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}
