import { GET as getTopicReadiness } from "../../../topics/[topicId]/readiness/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicReadiness(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
