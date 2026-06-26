import { GET as getLessonQuestions } from "@/features/tutoring/server/api/lesson-questions-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonQuestions(request, {
    params: Promise.resolve({ lessonId: lessonId }),
  });
}
