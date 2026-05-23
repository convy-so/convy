import { ExpertFrameworkStudioPicker } from "@/components/expert/expert-framework-studio-picker";
import { listExpertFrameworkCourseSummaries } from "@/lib/learning/expert-framework-summaries";

export default async function ExpertFrameworkStudioPage() {
  const courseFrameworks = await listExpertFrameworkCourseSummaries();

  return <ExpertFrameworkStudioPicker initialFrameworks={courseFrameworks} />;
}
