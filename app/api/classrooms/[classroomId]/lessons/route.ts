import { GET as getClassroomLessons } from "@/features/tutoring/server/api/classroom-lessons-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  return getClassroomLessons(request, {
    params: Promise.resolve({ classroomId }),
  });
}