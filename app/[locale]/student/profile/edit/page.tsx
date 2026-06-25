import { redirect } from "next/navigation";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getPrimaryStudentMembership } from "@/features/tutoring/server/access";
import { getOnboardingStateData } from "@/shared/http/page-data";
import { StudentOnboardingClient } from "@/features/tutoring/ui/student-onboarding-client";

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
