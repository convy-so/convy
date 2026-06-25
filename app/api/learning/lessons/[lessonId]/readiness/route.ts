import { GET as getLessonReadiness } from "@/features/tutoring/server/api/lesson-readiness-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonReadiness(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}