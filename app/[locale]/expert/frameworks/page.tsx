import { Workflow, Plus } from "lucide-react";
import { ExpertLearningOps } from "@/components/admin/expert-learning-ops";

export default function FrameworksPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Pedagogical Frameworks
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage tutoring asset versions, runtime models, and eval baselines.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        {/* We are reusing the existing complex logic component here for now, 
            but it should eventually be broken down into V2 styled components. */}
        <ExpertLearningOps />
      </div>
    </div>
  );
}
