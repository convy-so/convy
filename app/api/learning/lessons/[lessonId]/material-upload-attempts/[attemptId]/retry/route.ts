import { POST as retryTopicMaterialUploadAttempt } from "../../../../../topics/[topicId]/material-upload-attempts/[attemptId]/retry/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; attemptId: string }> },
) {
  const { lessonId, attemptId } = await params;
  return retryTopicMaterialUploadAttempt(request, {
    params: Promise.resolve({ topicId: lessonId, attemptId }),
  });
}
