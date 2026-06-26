import { GET as getLessonReports } from "@/features/tutoring/server/api/lesson-reports-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonReports(request, {
    params: Promise.resolve({ lessonId: lessonId }),
  });
}
