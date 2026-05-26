import {
  GET as getTopicMaterials,
  POST as postTopicMaterials,
} from "../../../topics/[topicId]/materials/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicMaterials(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return postTopicMaterials(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
