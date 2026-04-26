import { ExpertAssetStudio } from "@/components/expert/expert-asset-studio";
import { ExpertRuntimePreview } from "@/components/expert/expert-runtime-preview";
import { ExpertEvalBaselines } from "@/components/expert/expert-eval-baselines";

export default function FrameworksPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Pedagogical Frameworks
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage tutoring asset versions, runtime models, and eval baselines.
        </p>
      </div>

      <ExpertAssetStudio />
      <ExpertRuntimePreview />
      <ExpertEvalBaselines />
    </div>
  );
}
