import { TeacherStudentReportDetailPage } from "@/features/tutoring/ui/teacher-student-report-detail-page";
import { getClassroomStudentReportDetailData } from "@/shared/http/page-data";

export default async function LearningStudentReportDetailPage({
  params,
}: {
  params: Promise<{ studentId: string; reportId: string }>;
}) {
  const { studentId, reportId } = await params;
  const report = await getClassroomStudentReportDetailData({
    classroomStudentId: studentId,
    reportId,
  });

  return <TeacherStudentReportDetailPage initialReport={report} />;
}
