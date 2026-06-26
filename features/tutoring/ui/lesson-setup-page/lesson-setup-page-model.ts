import type { getLessonMaterialsData, getLessonSetupData } from "@/shared/http/page-data";

export type LessonMaterialItem = Awaited<
  ReturnType<typeof getLessonMaterialsData>
>["data"][number];

export type LessonMaterialListItem = Pick<
  LessonMaterialItem,
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
  initialData: Awaited<ReturnType<typeof getLessonSetupData>>;
  initialMaterials: Awaited<ReturnType<typeof getLessonMaterialsData>>;
};

