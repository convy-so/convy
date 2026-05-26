import { GET as getTopicQuestions } from "../../../topics/[topicId]/questions/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicQuestions(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
