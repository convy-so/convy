import {
  GET as getLessonMaterials,
  POST as postLessonMaterials,
} from "@/features/tutoring/server/api/lesson-materials-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return getLessonMaterials(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;
  return postLessonMaterials(request, {
    params: Promise.resolve({ topicId: lessonId }),
  });
}