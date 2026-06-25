import type { getTopicMaterialsData, getTopicSetupData } from "@/shared/http/page-data";

export type TopicMaterialItem = Awaited<
  ReturnType<typeof getTopicMaterialsData>
>["data"][number];

export type TopicMaterialListItem = Pick<
  TopicMaterialItem,
  | "id"
  | "title"
  | "description"
  | "materialKind"
  | "extractionStatus"
  | "indexingStatus"
  | "mimeType"
  | "createdAt"
  | "analysis"
>;

export type LessonSetupPageProps = {
  initialData: Awaited<ReturnType<typeof getTopicSetupData>>;
  initialMaterials: Awaited<ReturnType<typeof getTopicMaterialsData>>;
};
