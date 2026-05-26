import { GET as getTopics } from "../topics/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  return getTopics(request, {
    params: Promise.resolve({ classroomId }),
  });
}
