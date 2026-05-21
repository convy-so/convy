import { ExpertFrameworkStudio } from "@/components/expert/expert-framework-studio";
import { listFrameworksWithTopicLite } from "@/lib/learning/framework-records";
import { listCourses } from "@/lib/learning/course-service";

export default async function ExpertFrameworksPage() {
  const [frameworks, courses] = await Promise.all([
    listFrameworksWithTopicLite(),
    listCourses(),
  ]);

  const courseFrameworks = courses.map((course) => {
    const framework =
      frameworks.find((candidate) => candidate.courseId === course.id) ?? null;

    return {
      id: framework?.id ?? null,
      courseId: course.id,
      courseKey: course.key,
      courseTitle: course.title,
      name: framework?.name ?? `${course.title} DEEP`,
      description: framework?.description ?? course.description,
      topicId: framework?.topicId ?? null,
      anchorTopicTitle: framework?.topic?.title ?? null,
      activeVersionId: framework?.activeVersionId ?? null,
      updatedAt: framework?.updatedAt.toISOString() ?? null,
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Courses And Frameworks
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Experts manage the course catalog and publish one active pedagogical framework per course.
        </p>
      </div>

      <ExpertFrameworkStudio
        initialFrameworks={courseFrameworks}
      />
    </div>
  );
}
