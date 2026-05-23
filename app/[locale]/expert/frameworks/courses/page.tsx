import { ExpertFrameworkCourses } from "@/components/expert/expert-framework-courses";
import { listExpertFrameworkCourseSummaries } from "@/lib/learning/expert-framework-summaries";

export default async function ExpertFrameworkCoursesPage() {
  const courseFrameworks = await listExpertFrameworkCourseSummaries();

  return <ExpertFrameworkCourses initialFrameworks={courseFrameworks} />;
}
