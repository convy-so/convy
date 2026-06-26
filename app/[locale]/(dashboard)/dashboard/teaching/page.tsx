import { WorkspaceHub } from "@/features/tutoring/ui/workspace-hub";
import { getTeacherTeachingWorkspaceInitialData } from "@/shared/http/page-data";
import { getVerifiedSession } from "@/features/auth/public-server";

export default async function TeachingPage() {
  const session = await getVerifiedSession();
  const authContext = { session };
  const teacherWorkspaceInitialData =
    await getTeacherTeachingWorkspaceInitialData(authContext);

  return (
    <WorkspaceHub
      initialStudentMe={{ role: "non-student", student: null, invitations: [] }}
      teacherWorkspaceInitialData={teacherWorkspaceInitialData}
    />
  );
}



