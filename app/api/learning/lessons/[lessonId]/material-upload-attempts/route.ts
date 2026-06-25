import { GET as getLessonMaterialUploadAttempts } from "@/features/tutoring/server/api/lesson-material-upload-attempts-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonMaterialUploadAttempts(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}