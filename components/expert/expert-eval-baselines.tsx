"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, TestTube2, CheckCircle2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

type EvalBootstrapResult = {
  presetKey: string;
  datasetId: string;
  datasetName: string;
  status: "created" | "existing";
  caseCount: number;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

export function ExpertEvalBaselines() {
  const [results, setResults] = useState<EvalBootstrapResult[]>([]);

  const bootstrapMutation = useMutation({
    mutationFn: async () =>
      (
        await fetchJson<{ success: true; data: EvalBootstrapResult[] }>(
          "/api/learning/expert/evals/bootstrap",
          { method: "POST" },
        )
      ).data,
    onSuccess: (data) => {
      setResults(data);
      toast.success(`${data.length} eval dataset(s) ready`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to bootstrap evals"),
  });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Subject Eval Baselines</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bootstrap offline tutoring eval datasets for math, physics, chemistry, and biology.
          </p>
        </div>
        <TestTube2 className="h-5 w-5 text-slate-400" />
      </div>

      <button
        type="button"
        onClick={() => bootstrapMutation.mutate()}
        disabled={bootstrapMutation.isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800 transition-colors"
      >
        {bootstrapMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <TestTube2 className="h-4 w-4" />
        )}
        Bootstrap Eval Datasets
      </button>

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Results</p>
          {results.map((result) => (
            <div
              key={result.datasetId}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#FAFAFA] p-4"
            >
              <div>
                <div className="font-semibold text-sm text-slate-950">{result.datasetName}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {result.caseCount > 0 ? `${result.caseCount} cases` : "No cases"}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                  result.status === "created"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {result.status === "created" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {result.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
