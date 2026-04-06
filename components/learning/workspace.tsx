"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { fetchLearningMe } from "@/lib/api/learning";
import { fetchActiveWorkspace } from "@/lib/api/workspace";
import { queryKeys } from "@/lib/query-keys";
import { GlassPanel } from "@/components/learning/glass-panel";
import { TeacherWorkspace } from "@/components/learning/teacher-workspace";
import { StudentWorkspace } from "@/components/learning/student-workspace";

export function LearningWorkspace() {
  const activeWorkspaceQuery = useQuery({
    queryKey: queryKeys.workspaces.active,
    queryFn: fetchActiveWorkspace,
  });
  const learningMeQuery = useQuery({
    queryKey: queryKeys.learning.me,
    queryFn: fetchLearningMe,
  });

  if (learningMeQuery.isLoading || activeWorkspaceQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-6 py-12">
        <GlassPanel className="flex w-full max-w-md items-center justify-center gap-3 px-6 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <span className="text-sm font-medium text-slate-600">
            Loading learning workspace...
          </span>
        </GlassPanel>
      </div>
    );
  }

  if (learningMeQuery.isError || activeWorkspaceQuery.isError) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">
            Learning workspace unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {learningMeQuery.error instanceof Error
              ? learningMeQuery.error.message
              : activeWorkspaceQuery.error instanceof Error
                ? activeWorkspaceQuery.error.message
                : "Something went wrong while loading the learning workspace."}
          </p>
        </GlassPanel>
      </div>
    );
  }

  const activeWorkspace = activeWorkspaceQuery.data;
  const learningMe = learningMeQuery.data;

  if (!learningMe) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <GlassPanel className="px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">
            Learning workspace unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            We could not load the workspace state.
          </p>
        </GlassPanel>
      </div>
    );
  }

  if (activeWorkspace) {
    return <TeacherWorkspace />;
  }

  if (learningMe.role === "student") {
    return <StudentWorkspace learningMe={learningMe} />;
  }

  return <TeacherWorkspace />;
}
