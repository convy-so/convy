import { desc } from "drizzle-orm";

import { getDb } from "@/db";
import { expertFrameworks, learningTopics } from "@/db/schema/learning";
import { ExpertFrameworkStudio } from "@/components/expert/expert-framework-studio";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";

export default async function ExpertFrameworksPage() {
  const [frameworks, topics] = await Promise.all([
    getDb().query.expertFrameworks.findMany({
      with: {
        topic: true,
      },
      orderBy: [desc(expertFrameworks.updatedAt)],
    }),
    getDb().query.learningTopics.findMany({
      with: {
        classroom: true,
      },
      orderBy: [desc(learningTopics.updatedAt)],
    }),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Pedagogical Frameworks
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create, rename, and bind expert frameworks to topics before drafting and publishing versions.
        </p>
      </div>

      <ExpertFrameworkStudio
        initialFrameworks={frameworks.map((framework) => ({
          id: framework.id,
          name: framework.name,
          description: framework.description,
          topicId: framework.topicId,
          topicTitle: framework.topic?.title ?? null,
          activeVersionId: framework.activeVersionId,
          updatedAt: framework.updatedAt.toISOString(),
        }))}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          subject: topic.subject ?? getSubjectDisplayLabel(topic.subjectKey),
          contentLocale: topic.contentLocale,
          classroomTitle: topic.classroom?.title ?? "Unknown classroom",
        }))}
      />
    </div>
  );
}
