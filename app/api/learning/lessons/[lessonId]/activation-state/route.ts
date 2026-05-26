import { GET as getTopicActivationState } from "../../../topics/[topicId]/activation-state/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicActivationState(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
