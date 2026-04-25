import {
  getAiOpsOverview,
  listExpertGuidanceSummary,
} from "@/app/actions/ai-ops";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function AiOpsDashboard() {
  const [overview, guidancePacks] = await Promise.all([
    getAiOpsOverview(),
    listExpertGuidanceSummary(),
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total AI runs", value: overview.totalRuns, helper: "All traced core AI executions (external via Braintrust)." },
          { label: "Runs this week", value: overview.weeklyRuns, helper: "Recent production and workflow activity." },
          { label: "Failed runs", value: overview.failedRuns, helper: "Runs that ended with an error status." },
          { label: "Eval datasets", value: overview.evalDatasetCount, helper: "Curated expert-owned quality datasets." },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              {card.value}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-1">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Active Expert Guidance Packs
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Strategic AI rules currently active in production.
            </p>
            <div className="mt-6 space-y-3">
              {guidancePacks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-[#FAFAFA] p-8 text-center text-sm text-slate-500">
                  No active guidance packs found in production.
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
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <h3 className="text-sm font-semibold text-slate-950">Observability Notice</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-2xl mx-auto">
          Detailed trace logs, eval runs, and failure mode analysis are routed to Braintrust for enhanced production monitoring.
        </p>
      </section>
    </div>
  );
}

