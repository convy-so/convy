import { GET as getTopicReports } from "../../../topics/[topicId]/reports/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getTopicReports(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}
