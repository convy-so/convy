import { Suspense } from "react";
import { Loader2, GraduationCap, AlertCircle } from "lucide-react";
import { getStudentMeData, getMyPatternSummaries } from "@/shared/http/page-data";
import { StudentClassesClient } from "./student-classes-client";

export default async function StudentClassesPage() {
  const [studentMe, patterns] = await Promise.all([
    getStudentMeData(),
    getMyPatternSummaries(),
  ]);

  if (studentMe.role !== "student") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Student area
          </h1>
          <p className="mt-3 text-slate-500 font-medium max-w-md mx-auto">
            This management hub is specifically designed for student learning paths and is only available for student accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-[#bceb9c] bg-[#eefbd6] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#3c7f0a]">
          <GraduationCap className="h-3.5 w-3.5 text-[#58cc02]" />
          Courses
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#3c3c3c] sm:text-4xl">My classes</h1>
        <p className="max-w-xl text-[15px] font-medium leading-relaxed text-[#777777]">
          Open a course to learn, or review your progress and scores anytime.
        </p>
      </div>

      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
        </div>
      }>
        <StudentClassesClient initialStudentMe={studentMe} initialPatterns={patterns} />
      </Suspense>
    </div>
  );
}

