import { TeacherStudentReportDetailPage } from "@/components/learning/teacher-student-report-detail-page";
import { getClassroomStudentReportDetailData } from "@/lib/server/app-queries";

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
