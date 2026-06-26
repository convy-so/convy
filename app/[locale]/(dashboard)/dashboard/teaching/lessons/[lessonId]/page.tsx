import { LessonSetupPage } from "@/features/tutoring/ui/lesson-setup-page";
import {
  getLessonMaterialsData,
  getLessonSetupData,
} from "@/shared/http/page-data";

export default async function TeachingLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const [lessonSetup, materials] = await Promise.all([
    getLessonSetupData(lessonId),
    getLessonMaterialsData(lessonId),
  ]);

  return (
    <LessonSetupPage
      initialData={lessonSetup}
      initialMaterials={materials}
    />
  );
}

