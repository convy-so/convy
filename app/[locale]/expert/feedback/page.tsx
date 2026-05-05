import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { isExpertRole } from "@/lib/auth/roles";
import { getVerifiedSession } from "@/lib/auth/session";
import { resolveFeedbackFormContext } from "@/lib/feedback/service";

export default async function ExpertFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieHeader = (await headers()).get("cookie");
  const session = await getVerifiedSession(cookieHeader).catch(() => null);

  if (!session || !isExpertRole(session.user)) {
    redirect(`/${locale}`);
  }

  const context = await resolveFeedbackFormContext(session.user);

  return (
    <FeedbackForm
      allowedRoles={context.allowedRoles}
      defaultRole={context.allowedRoles.includes("expert") ? "expert" : context.defaultRole}
      contactEmail={context.contactEmail}
      heading="Expert complaints and suggestions"
      description="Report operational friction, review gaps, or product changes that would improve the expert workflow."
    />
  );
}
