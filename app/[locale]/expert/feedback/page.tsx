import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
import { isExpert } from "@/features/auth/public-server";
import { getVerifiedSession } from "@/features/auth/public-server";
import { resolveFeedbackFormContext } from "@/features/feedback/server/feedback-service";

export default async function ExpertFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieHeader = (await headers()).get("cookie");
  const session = await getVerifiedSession(cookieHeader).catch(() => null);

  if (!session || !isExpert(session.user)) {
    redirect(`/${locale}`);
  }

  const context = await resolveFeedbackFormContext(session.user);

  return (
    <FeedbackForm
      defaultRole={context.allowedRoles.includes("expert") ? "expert" : context.defaultRole}
      contactEmail={context.contactEmail}
      heading="Expert complaints and suggestions"
      description="Report operational friction, review gaps, or product changes that would improve the expert workflow."
    />
  );
}
