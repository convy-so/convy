import { StudentSessionsPageContent } from "./student-sessions-page-content";

export default async function StudentSessionsPage(props: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const { classroomId } = await props.searchParams;
  return <StudentSessionsPageContent classroomId={classroomId} />;
}
