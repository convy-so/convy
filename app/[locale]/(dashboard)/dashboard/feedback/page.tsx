import { redirect } from "next/navigation";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveFeedbackFormContext } from "@/lib/feedback/service";

export default async function DashboardFeedbackPage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const context = await resolveFeedbackFormContext(session.user);

  return (
    <FeedbackForm
      allowedRoles={context.allowedRoles}
      defaultRole={context.defaultRole}
      contactEmail={context.contactEmail}
      heading="Complaints and suggestions"
      description="Share product issues, friction, or improvement ideas from the teacher or student experience."
    />
  );
}
