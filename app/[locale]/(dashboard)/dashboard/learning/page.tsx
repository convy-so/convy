import { LearningHub } from "@/components/learning/learning-hub";
import {
  getStudentLearningWorkspaceInitialData,
  getTeacherLearningWorkspaceInitialData,
} from "@/lib/server/app-queries";

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string; language?: string }>;
}) {
  const { classroomId, language } = await searchParams;
  const studentWorkspaceInitialData = await getStudentLearningWorkspaceInitialData({
    classroomId,
    language,
  });

  const teacherWorkspaceInitialData =
    studentWorkspaceInitialData.learningMe.role === "student"
      ? undefined
      : await getTeacherLearningWorkspaceInitialData();

  return (
    <LearningHub
      initialLearningMe={studentWorkspaceInitialData.learningMe}
      initialStudentPatterns={studentWorkspaceInitialData.initialPatterns}
      initialOnboardingState={studentWorkspaceInitialData.initialOnboardingState}
      initialTutoringSession={studentWorkspaceInitialData.initialTutoringSession}
      teacherWorkspaceInitialData={teacherWorkspaceInitialData}
    />
  );
}
