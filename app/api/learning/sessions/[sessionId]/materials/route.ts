import {
  GET as getTopicMaterials,
  POST as postTopicMaterials,
} from "../../../topics/[topicId]/materials/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return getTopicMaterials(request, {
    params: Promise.resolve({ topicId: sessionId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return postTopicMaterials(request, {
    params: Promise.resolve({ topicId: sessionId }),
  });
}
