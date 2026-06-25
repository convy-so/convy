import { listCourses } from "@/features/tutoring/server/course-service";
import { listFrameworkRecords } from "@/features/tutoring/server/framework-records";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export type ExpertFrameworkCourseSummary = {
  courseId: string;
  courseTitle: string;
  description: string | null;
  frameworkCount: number;
  activeFrameworkId: string | null;
  activeFrameworkName: string | null;
  updatedAt: string | null;
};

export async function listExpertFrameworkCourseSummaries(): Promise<
  ExpertFrameworkCourseSummary[]
> {
  const [courses, frameworks] = await Promise.all([
    listCourses(),
    listFrameworkRecords({ includeArchived: false }),
  ]);

  return courses.map((course) => {
    const courseFrameworks = frameworks.filter(
      (framework) => framework.courseId === course.id,
    );
    const activeFramework =
      courseFrameworks.find(
        (framework) => framework.status === LEARNING_STATUS.frameworkActive,
      ) ?? null;
    const latestFramework = courseFrameworks[0] ?? null;

    return {
      courseId: course.id,
      courseTitle: course.title,
      description: course.description,
      frameworkCount: courseFrameworks.length,
      activeFrameworkId: activeFramework?.id ?? null,
      activeFrameworkName: activeFramework?.name ?? null,
      updatedAt: latestFramework?.updatedAt.toISOString() ?? null,
    };
  });
}
