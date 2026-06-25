import { GET as getLessonActivationState } from "@/features/tutoring/server/api/lesson-activation-state-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonActivationState(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}