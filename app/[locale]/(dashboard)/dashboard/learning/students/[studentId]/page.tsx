import { TeacherStudentDetailPage } from "@/features/tutoring/ui/teacher-student-detail-page";
import {
  getClassroomStudentOverviewData,
  getClassroomStudentPatternData,
} from "@/shared/http/page-data";

export default async function LearningStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId: classroomStudentId } = await params;
  const [overview, patterns] = await Promise.all([
    getClassroomStudentOverviewData(classroomStudentId),
    getClassroomStudentPatternData(classroomStudentId),
  ]);

  return (
    <TeacherStudentDetailPage
      initialOverview={overview}
      initialPatterns={patterns}
    />
  );
}
