import {
  getAiOpsOverview,
  listExpertGuidanceSummary,
  listFailureModeSummary,
  listRecentAiRuns,
  listRecentEvalRuns,
} from "@/app/actions/ai-ops";
import { getEvalBlueprint } from "@/lib/ai/eval-catalog";

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
  const [overview, recentRuns, recentEvalRuns, failureModes, guidancePacks] = await Promise.all([
    getAiOpsOverview(),
    listRecentAiRuns(),
    listRecentEvalRuns(),
    listFailureModeSummary(),
    listExpertGuidanceSummary(),
  ]);
  const evalStandards = ([
    "tutoring_chat",
    "survey_conducting",
  ] as const).flatMap((feature) => {
    const blueprint = getEvalBlueprint(feature);
    return blueprint ? [blueprint] : [];
  });

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total AI runs", value: overview.totalRuns, helper: "All traced core AI executions." },
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

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Recent AI Runs
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Shared observability for experts and admins across tutoring and survey flows.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Viewer: {overview.viewerRole}
            </span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Feature</th>
                  <th className="pb-3 pr-4">Scenario</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Model</th>
                  <th className="pb-3 pr-4">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{run.feature}</td>
                    <td className="py-3 pr-4 text-slate-600">{run.scenarioType ?? "n/a"}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          run.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : run.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {run.modelName ?? run.modelProvider ?? "n/a"}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(run.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Recent Eval Runs
            </h2>
            <div className="mt-4 space-y-3">
              {recentEvalRuns.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No eval runs have been recorded yet.
                </p>
              ) : (
                recentEvalRuns.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{item.feature}</div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.triggerType}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {item.status} | {formatDate(item.createdAt)}
                    </div>
                    {typeof item.summary?.passRate === "number" ? (
                      <div className="mt-2 text-sm text-slate-700">
                        Pass rate {Math.round(Number(item.summary.passRate) * 100)}% |{" "}
                        {item.summary?.qualityGatePassed ? "quality gate passed" : "quality gate failed"}
                      </div>
                    ) : null}
                    {typeof item.summary?.blockerFailureCount === "number" ? (
                      <div className="mt-1 text-sm text-slate-600">
                        Blocker misses {Number(item.summary.blockerFailureCount)} | Missing outputs{" "}
                        {Number(item.summary?.missingActualOutputCount ?? 0)}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Failure Modes
            </h2>
            <div className="mt-4 space-y-3">
              {failureModes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{item.title}</div>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {item.labelCount} labels
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {item.feature} | {item.code} | {item.severity}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Expert Guidance Packs
            </h2>
            <div className="mt-4 space-y-3">
              {guidancePacks.map((pack) => (
                <div key={pack.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="font-medium text-slate-900">{pack.name}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {pack.feature} | {pack.artifactType} | {pack.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Educational Eval Standards
            </h2>
            <div className="mt-4 space-y-4">
              {evalStandards.map((blueprint) => (
                <div
                  key={blueprint.feature}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{blueprint.feature}</div>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Target pass {Math.round(blueprint.targetPassRate * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Blocker floor {Math.round(blueprint.releaseBlockerFloor * 100)}%
                  </div>
                  <div className="mt-3 space-y-2">
                    {blueprint.dimensions.slice(0, 4).map((dimension) => (
                      <div key={dimension.key} className="text-sm text-slate-700">
                        {dimension.label}: floor {Math.round(dimension.passFloor * 100)}%
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
