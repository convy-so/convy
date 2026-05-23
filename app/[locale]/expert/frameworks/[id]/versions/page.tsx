import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { expertFrameworkVersions } from "@/db/schema/learning";
import { ExpertFrameworkVersionStudio } from "@/components/expert/expert-framework-version-studio";
import { getFrameworkWithTopicLite } from "@/lib/learning/framework-records";

export default async function ExpertFrameworkVersionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;

  const framework = await getFrameworkWithTopicLite(id);

  if (!framework) {
    redirect("/expert/frameworks");
  }

  const versions = await getDb().query.expertFrameworkVersions.findMany({
    where: eq(expertFrameworkVersions.frameworkId, framework.id),
    orderBy: (table, { desc }) => [desc(table.version)],
  });

  return (
    <ExpertFrameworkVersionStudio
      framework={{
        id: framework.id,
        name: framework.name,
        description: framework.description,
        courseId: framework.course.id,
        courseKey: framework.course.key,
        courseTitle: framework.course.title,
        topicId: framework.topicId,
        anchorTopicTitle: framework.topic?.title ?? null,
        activeVersionId: framework.activeVersionId,
      }}
      initialVersions={versions.map((version) => ({
        id: version.id,
        frameworkId: version.frameworkId,
        version: version.version,
        status: version.status,
        seedSource: version.seedSource,
        notes: version.notes,
        framework: version.framework as Record<string, unknown>,
        createdAt: version.createdAt.toISOString(),
      }))}
    />
  );
}
