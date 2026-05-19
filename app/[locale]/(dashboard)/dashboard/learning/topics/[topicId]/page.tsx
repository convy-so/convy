import { TopicSetupPage } from "@/components/learning/topic-setup-page";
import {
  getTopicMaterialsData,
  getTopicSetupData,
} from "@/lib/server/app-queries";

export default async function LearningTopicDetailPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const [topicSetup, materials] = await Promise.all([
    getTopicSetupData(topicId),
    getTopicMaterialsData(topicId),
  ]);

  return (
    <TopicSetupPage
      initialData={topicSetup}
      initialMaterials={materials}
    />
  );
}
