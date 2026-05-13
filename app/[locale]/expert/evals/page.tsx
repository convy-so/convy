import { ExpertEvalBaselines } from "@/components/expert/expert-eval-baselines";

export default function ExpertEvalsPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Eval Baselines
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bootstrap the expert eval families used to regression-check tutoring quality.
        </p>
      </div>

      <ExpertEvalBaselines />
    </div>
  );
}
