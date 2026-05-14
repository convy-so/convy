import { TeacherStudentDetailPage } from "@/components/learning/teacher-student-detail-page";
import {
  getStudentOverviewData,
  getStudentPatternData,
} from "@/lib/server/app-queries";

export default async function LearningStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const [overview, patterns] = await Promise.all([
    getStudentOverviewData(studentId),
    getStudentPatternData(studentId),
  ]);

  return (
    <TeacherStudentDetailPage
      initialOverview={overview}
      initialPatterns={patterns}
    />
  );
}
