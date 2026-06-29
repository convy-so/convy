import { getVerifiedSession } from "@/features/auth/public-server";
import { ExpertFrameworkStudioPicker } from "@/features/tutoring/expert/ui/expert-framework-studio-picker";
import { listExpertFrameworkCourseSummaries } from "@/features/tutoring/server/expert-framework-summaries";

export default async function ExpertFrameworkStudioPage() {
  const session = await getVerifiedSession();
  const courseFrameworks = await listExpertFrameworkCourseSummaries();

  return (
    <ExpertFrameworkStudioPicker
      initialFrameworks={courseFrameworks}
      currentUserId={session.user.id}
    />
  );
}
