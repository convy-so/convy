import { Suspense } from "react";
import { Loader2, GraduationCap, AlertCircle } from "lucide-react";
import { getLearningMeData, getMyPatternSummaries } from "@/lib/server/app-queries";
import { StudentClassesClient } from "./student-classes-client";

export default async function StudentClassesPage() {
  const [learningMe, patterns] = await Promise.all([
    getLearningMeData(),
    getMyPatternSummaries(),
  ]);

  if (learningMe.role !== "student") {
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
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em]">
          <GraduationCap className="w-4 h-4" />
          Academic Management
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">My Classes</h1>
        <p className="text-slate-500 font-medium text-lg">Manage your active classroom memberships and performance records.</p>
      </div>

      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
        </div>
      }>
        <StudentClassesClient initialLearningMe={learningMe} initialPatterns={patterns} />
      </Suspense>
    </div>
  );
}
