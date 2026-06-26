import { StudentProfilePage } from "@/features/tutoring/ui/student-profile-page";
import {
  getStudentMeData,
  getMyPatternSummaries,
  getOnboardingStateData,
} from "@/shared/http/page-data";

export default async function TeachingProfilePage() {
  const [studentMe, patterns] = await Promise.all([
    getStudentMeData(),
    getMyPatternSummaries(),
  ]);
  const onboardingState =
    studentMe.role === "student" ? await getOnboardingStateData() : undefined;

  return (
    <StudentProfilePage
      initialStudentMe={studentMe}
      initialPatterns={patterns}
      initialOnboardingState={onboardingState}
    />
  );
}

