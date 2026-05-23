import { getLearningSessionById } from "@/lib/learning/storage";
import {
  GET as getTopicMaterials,
  POST as postTopicMaterials,
} from "../../../topics/[topicId]/materials/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sessionRecord = await getLearningSessionById(sessionId);
  const resolvedTopicId = sessionRecord?.topicId || sessionId;

  return getTopicMaterials(request, {
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

  return postTopicMaterials(request, {
    params: Promise.resolve({ topicId: resolvedTopicId }),
  });
}
