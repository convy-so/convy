"use client";

import { Loader2 } from "lucide-react";

import type { LearningMeData } from "@/lib/api/learning";
import { GlassPanel } from "@/components/learning/glass-panel";
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
}) {
  const learningMe = initialLearningMe;

  if (!learningMe) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">
            Learning hub unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            We could not load the learning state.
          </p>
        </GlassPanel>
      </div>
    );
  }

  if (learningMe.role === "student") {
    return (
      <StudentLearningHome
        learningMe={{ ...learningMe, invitations: learningMe.invitations ?? [] }}
        initialPatterns={initialStudentPatterns}
        initialOnboardingState={initialOnboardingState}
        initialTutoringSession={initialTutoringSession}
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
