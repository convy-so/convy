import { ExpertQaReview } from "@/components/expert/expert-qa-review";

export default function QaReviewPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            QA Review & Conflicts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Audit student-AI interactions, provide expert corrections, and resolve reasoning conflicts.
          </p>
        </div>
      </div>

      <div className="mt-2">
        <ExpertQaReview />
      </div>
    </div>
  );
}
