import { TeacherReportsPage } from "@/features/tutoring/ui/teacher-reports-page";
import {
  getClassroomLessonsData,
  getTeacherClassroomsData,
  getLessonReportsData,
} from "@/shared/http/page-data";

export default async function TeachingReportsPage() {
  const initialClassrooms = await getTeacherClassroomsData();
  const initialClassroomId = initialClassrooms.data[0]?.id ?? null;
  const initialLessons = initialClassroomId
    ? await getClassroomLessonsData(initialClassroomId)
    : undefined;
  const initialLessonId = initialLessons?.data[0]?.id ?? null;
  const initialReportsPayload = initialLessonId
    ? await getLessonReportsData(initialLessonId)
    : undefined;

  return (
    <TeacherReportsPage
      initialClassrooms={initialClassrooms}
      initialLessons={initialLessons}
      initialReportsPayload={initialReportsPayload}
    />
  );
}

