import { FewShotManager } from "@/components/expert/few-shot-manager";
import { listExpertFewShotExamples } from "@/app/actions/ai-ops";

export default async function ExpertFewShotPage() {
  const examplesResult = await listExpertFewShotExamples();
  const examples = examplesResult.success ? examplesResult.data : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Few-Shot Library
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Curate retrieval-ready few-shot examples for tutoring and survey behaviors.
        </p>
      </div>

      <FewShotManager initialExamples={examples} />
    </div>
  );
}
