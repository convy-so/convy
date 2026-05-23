import { listFrameworksWithTopicLite } from "@/lib/learning/framework-records";
import { listCourses } from "@/lib/learning/course-service";

export type ExpertFrameworkCourseSummary = {
  id: string | null;
  courseId: string;
  courseKey: string;
  courseTitle: string;
  name: string | null;
  description: string | null;
  topicId: string | null;
  anchorTopicTitle: string | null;
  activeVersionId: string | null;
  updatedAt: string | null;
};

export async function listExpertFrameworkCourseSummaries(): Promise<
  ExpertFrameworkCourseSummary[]
> {
  const [frameworks, courses] = await Promise.all([
    listFrameworksWithTopicLite(),
    listCourses(),
  ]);

  return courses.map((course) => {
    const framework =
      frameworks.find((candidate) => candidate.courseId === course.id) ?? null;

    return {
      id: framework?.id ?? null,
      courseId: course.id,
      courseKey: course.key,
      courseTitle: course.title,
      name: framework?.name ?? null,
      description: framework?.description ?? course.description,
      topicId: framework?.topicId ?? null,
      anchorTopicTitle: framework?.topic?.title ?? null,
      activeVersionId: framework?.activeVersionId ?? null,
      updatedAt: framework?.updatedAt.toISOString() ?? null,
    };
  });
}
