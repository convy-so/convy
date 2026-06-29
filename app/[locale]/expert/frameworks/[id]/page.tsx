import { redirect } from "next/navigation";

import { getVerifiedSession } from "@/features/auth/public-server";
import { ExpertFrameworkVersionStudio } from "@/features/tutoring/expert/ui/expert-framework-version-studio";
import {
  canUserManageFramework,
  getFrameworkById,
} from "@/features/tutoring/server/framework-runtime-storage";

export default async function ExpertFrameworkPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const session = await getVerifiedSession();
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
        createdByUserId: framework.createdByUserId,
        draftFramework: framework.draftFramework as Record<string, unknown>,
        liveFramework: framework.liveFramework as Record<string, unknown> | null,
        activatedAt: framework.activatedAt?.toISOString() ?? null,
      }}
      canEdit={canUserManageFramework(framework, session.user.id)}
    />
  );
}
