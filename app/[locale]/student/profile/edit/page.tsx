import { redirect } from "next/navigation";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getPrimaryStudentMembership } from "@/lib/learning/access";
import { getOnboardingStateData } from "@/lib/server/app-queries";
import { StudentOnboardingClient } from "@/components/learning/student-onboarding-client";

export default async function StudentProfileEditPage() {
  const session = await getVerifiedSession();
  const membership = await getPrimaryStudentMembership(session.user.id);

  if (!membership) {
    redirect("/student/classes");
  }

  const onboardingState = await getOnboardingStateData({ session });

  return (
    <StudentOnboardingClient
      membershipId={membership.id}
      initialOnboardingState={onboardingState}
      completionHref="/student/profile"
    />
  );
}
