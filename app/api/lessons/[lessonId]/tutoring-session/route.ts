import {
  GET as getLessonTutoringSession,
  POST as postLessonTutoringSession,
} from "@/features/tutoring/server/api/lesson-tutoring-session-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonTutoringSession(request, {
    params: Promise.resolve({ lessonId: lessonId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return postLessonTutoringSession(request, {
    params: Promise.resolve({ lessonId: lessonId }),
  });
}
