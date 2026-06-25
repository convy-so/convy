import { StudentProgressPageContent } from "./student-progress-page-content";

export default async function StudentProgressPage(props: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const { classroomId } = await props.searchParams;
  return <StudentProgressPageContent classroomId={classroomId} />;
}
