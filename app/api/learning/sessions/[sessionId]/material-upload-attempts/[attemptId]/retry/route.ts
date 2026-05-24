import { getLearningSessionById } from "@/lib/learning/storage";
import { POST as retryTopicMaterialUploadAttempt } from "../../../../../topics/[topicId]/material-upload-attempts/[attemptId]/retry/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; attemptId: string }> },
) {
  const { sessionId, attemptId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return retryTopicMaterialUploadAttempt(request, {
    params: Promise.resolve({ topicId: resolvedTopicId, attemptId }),
  });
}
