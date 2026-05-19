import { LearningHub } from "@/components/learning/learning-hub";
import { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { getVerifiedSession } from "@/lib/auth/dal";

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
