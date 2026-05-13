import { TeacherTopicDetailPage } from "@/components/learning/teacher-topic-detail-page";
import {
  getTopicMaterialsData,
  getTopicOverviewData,
  getTopicQuestionsData,
  getTopicReadinessData,
  getTopicReportsData,
} from "@/lib/server/app-queries";

export default async function LearningTopicDetailPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const [overview, materials, readiness, reports, questions] = await Promise.all([
    getTopicOverviewData(topicId),
    getTopicMaterialsData(topicId),
    getTopicReadinessData(topicId),
    getTopicReportsData(topicId),
    getTopicQuestionsData(topicId),
  ]);

  return (
    <TeacherTopicDetailPage
      initialOverview={overview}
      initialMaterials={materials}
      initialReadiness={readiness}
      initialReports={reports}
      initialQuestions={questions}
    />
  );
}
