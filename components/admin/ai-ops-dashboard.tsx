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
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {card.label}
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {card.value}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-1">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Expert Guidance Packs
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage active guidance and prompt strategies for core features.
            </p>
            <div className="mt-4 space-y-3">
              {guidancePacks.length === 0 ? (
                <p className="text-sm text-slate-600">No guidance packs found.</p>
              ) : (
                guidancePacks.map((pack: any) => (
                  <div key={pack.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="font-medium text-slate-900">{pack.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {pack.feature} | {pack.artifactType} | {pack.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-slate-200 p-8 text-center">
        <h3 className="text-sm font-medium text-slate-900">Observability Notice</h3>
        <p className="mt-1 text-sm text-slate-500">
          Detailed trace logs, eval runs, and failure mode analysis have been moved to Braintrust for enhanced production monitoring.
        </p>
      </section>
    </div>
  );
}

