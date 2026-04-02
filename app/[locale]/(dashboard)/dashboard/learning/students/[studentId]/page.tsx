import { TeacherStudentDetailPage } from "@/components/learning/teacher-student-detail-page";

export default async function LearningStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <TeacherStudentDetailPage studentId={studentId} />;
}
