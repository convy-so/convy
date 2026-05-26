import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getStudentLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { LiveSessionClient } from "../live-session-client";

interface LessonTutoringPageProps {
  params: Promise<{ locale: string; classroomId: string; lessonId: string }>;
}

export default async function LessonTutoringPage({
  params,
}: LessonTutoringPageProps) {
  const { locale, classroomId, lessonId } = await params;
  const authHeaders = await headers();
  const session = await getVerifiedSession(authHeaders).catch(() => null);

  if (!session) {
    redirect(`/${locale}/sign-in`);
  }

  const {
    learningMe,
    initialPatterns,
    initialTutoringSession,
  } = await getStudentLearningWorkspaceInitialData({
    classroomId,
    lessonId,
    language: locale,
  });

  if (learningMe.role !== "student") {
    redirect(`/${locale}/student/classes`);
  }

  return (
    <LiveSessionClient
      classroomId={classroomId}
      lessonId={lessonId}
      learningMe={learningMe}
      initialPatterns={initialPatterns}
      initialTutoringSession={initialTutoringSession}
    />
  );
}
