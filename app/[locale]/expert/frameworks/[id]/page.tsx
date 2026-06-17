import { redirect } from "next/navigation";

import { ExpertFrameworkVersionStudio } from "@/components/expert/expert-framework-version-studio";
import { getFrameworkById } from "@/lib/learning/framework-runtime-storage";

export default async function ExpertFrameworkPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const framework = await getFrameworkById(id);

  if (!framework) {
    redirect("/expert/frameworks/studio");
  }

  return (
    <ExpertFrameworkVersionStudio
      framework={{
        id: framework.id,
        courseId: framework.course.id,
        courseTitle: framework.course.title,
        name: framework.name,
        description: framework.description,
        status: framework.status,
        draftFramework: framework.draftFramework as Record<string, unknown>,
        liveFramework: framework.liveFramework as Record<string, unknown> | null,
        activatedAt: framework.activatedAt?.toISOString() ?? null,
      }}
    />
  );
}
