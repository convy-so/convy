import { StudentProfilePage } from "@/components/learning/student-profile-page";
import {
  getLearningMeData,
  getMyPatternSummaries,
  getOnboardingStateData,
} from "@/lib/server/app-queries";

export default async function LearningProfilePage() {
  const [learningMe, patterns] = await Promise.all([
    getLearningMeData(),
    getMyPatternSummaries(),
  ]);
  const onboardingState =
    learningMe.role === "student" ? await getOnboardingStateData() : undefined;

  return (
    <StudentProfilePage
      initialLearningMe={learningMe}
      initialPatterns={patterns}
      initialOnboardingState={onboardingState}
    />
  );
}
