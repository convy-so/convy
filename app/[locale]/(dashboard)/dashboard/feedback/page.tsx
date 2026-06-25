import { redirect } from "next/navigation";

import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
import { getCurrentSession } from "@/features/auth/public-server";
import { resolveFeedbackFormContext } from "@/features/feedback/server/feedback-service";

export default async function DashboardFeedbackPage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const context = await resolveFeedbackFormContext(session.user);

  return (
    <FeedbackForm
      defaultRole={context.defaultRole}
      contactEmail={context.contactEmail}
      heading="Complaints and suggestions"
      description="Share product issues, friction, or improvement ideas from the teacher or student experience."
    />
  );
}
