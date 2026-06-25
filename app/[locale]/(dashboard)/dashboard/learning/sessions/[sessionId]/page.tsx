import { LessonSetupPage } from "@/features/tutoring/ui/lesson-setup-page";
import {
  getTopicMaterialsData,
  getTopicSetupData,
} from "@/shared/http/page-data";

export default async function LearningSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [topicSetup, materials] = await Promise.all([
    getTopicSetupData(sessionId),
    getTopicMaterialsData(sessionId),
  ]);

  return (
    <LessonSetupPage
      initialData={topicSetup}
      initialMaterials={materials}
    />
  );
}
