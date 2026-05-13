import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { expertFrameworks, expertFrameworkVersions } from "@/db/schema/learning";
import { ExpertFrameworkVersionStudio } from "@/components/expert/expert-framework-version-studio";

export default async function ExpertFrameworkVersionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;

  const framework = await getDb().query.expertFrameworks.findFirst({
    where: eq(expertFrameworks.id, id),
    with: {
      topic: true,
    },
  });

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
        topicId: framework.topicId,
        topicTitle: framework.topic?.title ?? null,
        activeVersionId: framework.activeVersionId,
      }}
      initialVersions={versions.map((version) => ({
        id: version.id,
        frameworkId: version.frameworkId,
        version: version.version,
        status: version.status,
        notes: version.notes,
        framework: version.framework as Record<string, unknown>,
        createdAt: version.createdAt.toISOString(),
      }))}
    />
  );
}
