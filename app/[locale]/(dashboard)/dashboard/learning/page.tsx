import { LearningHub } from "@/features/tutoring/ui/learning-hub";
import { getTeacherLearningWorkspaceInitialData } from "@/shared/http/page-data";
import { getVerifiedSession } from "@/features/auth/public-server";

export default async function LearningPage() {
  const session = await getVerifiedSession();
  const authContext = { session };
  const teacherWorkspaceInitialData =
    await getTeacherLearningWorkspaceInitialData(authContext);

  return (
    <LearningHub
      initialLearningMe={{ role: "non-student", student: null, invitations: [] }}
      teacherWorkspaceInitialData={teacherWorkspaceInitialData}
    />
  );
}
