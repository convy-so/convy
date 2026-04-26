import { listExpertGuidanceSummary, listExpertFewShotExamples } from "@/app/actions/ai-ops";
import { FewShotManager } from "@/components/admin/few-shot-manager";

export default async function PromptsLibraryPage() {
  const [guidancePacks, fewShotExamples] = await Promise.all([
    listExpertGuidanceSummary(),
    listExpertFewShotExamples()
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Prompt Library
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage few-shot examples and system-level guidance packs.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <FewShotManager initialExamples={fewShotExamples as any} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Expert Guidance Packs
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              System-level instructions injected into active personas.
            </p>

            <div className="mt-6 space-y-3">
              {guidancePacks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-[#FAFAFA] p-8 text-center text-sm text-slate-500">
                  No guidance packs found.
                </div>
              ) : (
                guidancePacks.map((pack: any) => (
                  <div key={pack.id} className="rounded-xl border border-slate-100 bg-[#FAFAFA] p-4 flex items-center justify-between transition-colors hover:bg-slate-50">
                    <div>
                      <div className="font-semibold text-slate-950">{pack.name}</div>
                      <div className="mt-1 text-xs text-slate-500 font-medium">
                        {pack.feature} &bull; {pack.artifactType}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      {pack.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
