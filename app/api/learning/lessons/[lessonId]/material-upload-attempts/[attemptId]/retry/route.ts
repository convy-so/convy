import { POST as retryLessonMaterialUpload } from "@/features/tutoring/server/api/retry-lesson-material-upload-route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; attemptId: string }> },
) {
  const { lessonId, attemptId } = await params;
  return retryLessonMaterialUpload(request, {
    params: Promise.resolve({ topicId: lessonId, attemptId }),
  });
}