"use client";

import { Loader2 } from "lucide-react";

import type { ComponentProps } from "react";

import type { StudentMeData } from "@/features/tutoring/public-client";
import { TeacherTeachingHome } from "@/features/tutoring/ui/teacher-teaching-home";
import { StudentClassesHome } from "@/features/tutoring/ui/student-classes-home";
import type {
  getStudentWorkspaceInitialData,
  getTeacherTeachingWorkspaceInitialData,
} from "@/shared/http/page-data";

export function WorkspaceHub({
  initialStudentMe,
  initialStudentPatterns,
  teacherWorkspaceInitialData,
  initialStudentSessions,
}: {
  initialStudentMe: StudentMeData;
  initialStudentPatterns?: Awaited<
    ReturnType<typeof getStudentWorkspaceInitialData>
  >["initialPatterns"];
  teacherWorkspaceInitialData?: Awaited<
    ReturnType<typeof getTeacherTeachingWorkspaceInitialData>
  >;
  initialStudentSessions?: ComponentProps<
    typeof StudentClassesHome
  >["initialStudentSessions"];
}) {
  const studentMe = initialStudentMe;

  if (!studentMe) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 px-8 py-12 shadow-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Workspace unavailable
          </h1>
          <p className="mt-3 text-slate-600 font-medium max-w-md mx-auto">
            We could not load your workspace state. Please try refreshing the page or contact support if the issue persists.
          </p>
        </div>
      </div>
    );
  }

  const isStudent = studentMe.role === "student";

  if (isStudent) {
    return (
      <StudentClassesHome
        studentMe={{ ...studentMe, invitations: studentMe.invitations ?? [] }}
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

  return <TeacherTeachingHome {...teacherWorkspaceInitialData} />;
}



