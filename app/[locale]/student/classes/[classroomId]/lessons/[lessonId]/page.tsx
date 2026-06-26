import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getStudentWorkspaceInitialData } from "@/shared/http/page-data";
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
    studentMe,
    initialPatterns,
    initialTutoringSession,
  } = await getStudentWorkspaceInitialData({
    classroomId,
    lessonId,
    language: locale,
  });

  if (studentMe.role !== "student") {
    redirect(`/${locale}/student/classes`);
  }

  return (
    <LiveSessionClient
      classroomId={classroomId}
      lessonId={lessonId}
      studentMe={studentMe}
      initialPatterns={initialPatterns}
      initialTutoringSession={initialTutoringSession}
    />
  );
}

