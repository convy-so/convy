import { getLearningSessionById } from "@/lib/learning/storage";
import { GET as getTopicMaterialUploadAttempts } from "../../../topics/[topicId]/material-upload-attempts/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return getTopicMaterialUploadAttempts(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}
