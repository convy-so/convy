import { TopicSetupPage } from "@/components/learning/topic-setup-page";
import {
  getTopicMaterialsData,
  getTopicSetupData,
} from "@/lib/server/app-queries";

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
    <TopicSetupPage
      initialData={topicSetup}
      initialMaterials={materials}
    />
  );
}
