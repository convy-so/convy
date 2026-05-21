import { redirect } from "next/navigation";

export default async function LearningTopicDetailPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  redirect(`/dashboard/learning/sessions/${topicId}`);
}
