import { GET as getTopicMaterialUploadAttempts } from "../../../topics/[topicId]/material-upload-attempts/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return getTopicMaterialUploadAttempts(request, {
    params: Promise.resolve({ topicId: sessionId }),
  });
}
