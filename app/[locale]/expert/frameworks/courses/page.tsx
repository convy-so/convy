import { ExpertFrameworkCourses } from "@/features/tutoring/expert/ui/expert-framework-courses";
import { listExpertFrameworkCourseSummaries } from "@/features/tutoring/server/expert-framework-summaries";

export default async function ExpertFrameworkCoursesPage() {
  const courseFrameworks = await listExpertFrameworkCourseSummaries();

  return <ExpertFrameworkCourses initialFrameworks={courseFrameworks} />;
}
