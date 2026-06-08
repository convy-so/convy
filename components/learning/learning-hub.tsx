"use client";

import { Loader2 } from "lucide-react";

import type { ComponentProps } from "react";

import type { LearningMeData } from "@/lib/api/learning";
import { TeacherLearningHome } from "@/components/learning/teacher-learning-home";
import { StudentLearningHome } from "@/components/learning/student-learning-home";
import type {
  getOnboardingStateData,
  getStudentLearningWorkspaceInitialData,
  getTeacherLearningWorkspaceInitialData,
} from "@/lib/server/app-queries";

export function LearningHub({
  initialLearningMe,
  initialStudentPatterns,
  initialOnboardingState,
  initialTutoringSession,
  teacherWorkspaceInitialData,
  initialStudentSessions,
}: {
  initialLearningMe: LearningMeData;
  initialStudentPatterns?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialPatterns"];
  initialOnboardingState?: Awaited<ReturnType<typeof getOnboardingStateData>>;
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialTutoringSession"];
  teacherWorkspaceInitialData?: Awaited<
    ReturnType<typeof getTeacherLearningWorkspaceInitialData>
  >;
  initialStudentSessions?: ComponentProps<
    typeof StudentLearningHome
  >["initialStudentSessions"];
}) {
  const learningMe = initialLearningMe;

  if (!learningMe) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 px-8 py-12 shadow-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Learning hub unavailable
          </h1>
          <p className="mt-3 text-slate-600 font-medium max-w-md mx-auto">
            We could not load your learning state. Please try refreshing the page or contact support if the issue persists.
          </p>
        </div>
      </div>
    );
  }

  const isStudent = learningMe.role === "student";

  if (isStudent) {
    return (
      <StudentLearningHome
        learningMe={{ ...learningMe, invitations: learningMe.invitations ?? [] }}
        initialPatterns={initialStudentPatterns}
        initialStudentSessions={initialStudentSessions}
      />
    );
  }

  if (!teacherWorkspaceInitialData) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-6 py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return <TeacherLearningHome {...teacherWorkspaceInitialData} />;
}
