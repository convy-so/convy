"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { fetchLearningMe } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { GlassPanel } from "@/components/learning/glass-panel";
import { TeacherLearningHome } from "@/components/learning/teacher-learning-home";
import { StudentLearningHome } from "@/components/learning/student-learning-home";

export function LearningHub() {
  const learningMeQuery = useQuery({
    queryKey: queryKeys.learning.me,
    queryFn: fetchLearningMe,
  });

  if (learningMeQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-6 py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          
      </div>
    );
  }

  if (learningMeQuery.isError) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">
            Learning hub unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {learningMeQuery.error instanceof Error
              ? learningMeQuery.error.message
              : "Something went wrong while loading the learning hub."}
          </p>
        </GlassPanel>
      </div>
    );
  }

  const learningMe = learningMeQuery.data;

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
      />
    );
  }

  return <TeacherLearningHome />;
}
