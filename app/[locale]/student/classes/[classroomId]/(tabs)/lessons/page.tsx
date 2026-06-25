import { ClassroomLessonsPageContent } from "./classroom-lessons-page-content";

interface ClassroomSessionsProps {
  params: Promise<{ locale: string; classroomId: string }>;
}

export default async function ClassroomSessionsPage({
  params,
}: ClassroomSessionsProps) {
  const { locale, classroomId } = await params;
  return (
    <ClassroomLessonsPageContent classroomId={classroomId} locale={locale} />
  );
}
