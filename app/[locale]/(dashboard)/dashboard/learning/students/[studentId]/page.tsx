import { TeacherStudentDetailPage } from "@/components/learning/teacher-student-detail-page";
import {
  getClassroomStudentOverviewData,
  getClassroomStudentPatternData,
} from "@/lib/server/app-queries";

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
