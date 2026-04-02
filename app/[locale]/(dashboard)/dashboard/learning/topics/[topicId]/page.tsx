import { TeacherTopicDetailPage } from "@/components/learning/teacher-topic-detail-page";

export default async function LearningTopicDetailPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return <TeacherTopicDetailPage topicId={topicId} />;
}
