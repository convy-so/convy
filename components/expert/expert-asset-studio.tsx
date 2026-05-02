"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { getFriendlyActionError } from "@/lib/action-ux";

type AssetPack = {
  id: string;
  name: string;
  artifactType: string;
  status: string;
  targetScope: string;
  activeVersionId: string | null;
  metadata: Record<string, unknown>;
};

type AssetVersion = {
  id: string;
  version: number;
  status: string;
  notes: string | null;
  releaseReadiness?: {
    ready: boolean;
    reason: string | null;
    latestEvalRunId: string | null;
    latestEvalStatus: string | null;
    passRate: number | null;
    qualityGatePassed: boolean;
  };
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    let errorMessage = "Request failed";
    if (payload && typeof payload === "object" && "error" in payload) {
      errorMessage = getFriendlyActionError((payload as { error: unknown }).error) || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return payload as T;
}

const SUBJECT_OPTIONS = [
  { key: "mathematics", label: "Mathematics" },
  { key: "physics", label: "Physics" },
  { key: "chemistry", label: "Chemistry" },
  { key: "biology", label: "Biology" },
  { key: "general", label: "General" },
];

const DEFAULT_ARTIFACT = JSON.stringify(
  {
    title: "Reasoning-first pattern",
    instructions: [
      "Ask for an attempt before teaching.",
      "Accept multiple valid strategies when the discipline allows it.",
    ],
  },
  null,
  2,
);

export function ExpertAssetStudio() {
  const queryClient = useQueryClient();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState("");
  const [artifactType, setArtifactType] = useState("question_pattern");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("mathematics");
  const [versionNotes, setVersionNotes] = useState("");
  const [artifactJson, setArtifactJson] = useState(DEFAULT_ARTIFACT);

  const assetsQuery = useQuery({
    queryKey: ["expertLearningAssets"],
    queryFn: async () =>
      (await fetchJson<{ success: true; data: AssetPack[] }>("/api/learning/expert/assets")).data,
  });

  const selectedPack = assetsQuery.data?.find((p) => p.id === selectedPackId) ?? assetsQuery.data?.[0] ?? null;
  const selectedSubjectLabel = SUBJECT_OPTIONS.find((s) => s.key === selectedSubjectKey)?.label ?? selectedSubjectKey;

  const versionsQuery = useQuery({
    queryKey: ["expertLearningAssetVersions", selectedPack?.id],
    queryFn: async () =>
      (
        await fetchJson<{ success: true; data: AssetVersion[] }>(
          `/api/learning/expert/assets/${selectedPack!.id}/versions`,
        )
      ).data,
    enabled: Boolean(selectedPack?.id),
  });

  const createPackMutation = useMutation({
    mutationFn: async () => {
      if (!packName.trim()) throw new Error("Pack name is required.");
      return (
        await fetchJson<{ success: true; data: AssetPack }>("/api/learning/expert/assets", {
          method: "POST",
          body: JSON.stringify({
            name: packName.trim(),
            artifactType,
            targetScope: "subject",
            metadata: {
              program: "germany_secondary",
              curriculumFrameworkKey: "kmk_de_sek1",
              subjectKey: selectedSubjectKey,
              subjectLabel: selectedSubjectLabel,
            },
          }),
        })
      ).data;
    },
    onSuccess: async (pack) => {
      setPackName("");
      setSelectedPackId(pack.id);
      toast.success("Asset pack created");
      await queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create pack"),
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPack) throw new Error("Pick an asset pack first.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(artifactJson);
      } catch {
        throw new Error("Invalid JSON in artifact editor.");
      }
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/assets/${selectedPack.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ artifact: parsed, notes: versionNotes.trim() }),
        },
      );
    },
    onSuccess: async () => {
      setVersionNotes("");
      toast.success("Draft version saved");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expertLearningAssetVersions", selectedPack?.id] }),
        queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save version"),
  });

  const activateVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      if (!selectedPack) throw new Error("Pick an asset pack first.");
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/assets/${selectedPack.id}/activate`,
        { method: "POST", body: JSON.stringify({ versionId }) },
      );
    },
    onSuccess: async () => {
      toast.success("Version activated");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expertLearningAssetVersions", selectedPack?.id] }),
        queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to activate version"),
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Left: Pack List + Creation */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Asset Packs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create versioned pedagogical assets per subject.
            </p>
          </div>
          <BookOpenCheck className="h-5 w-5 text-slate-400" />
        </div>

        {/* Create new pack */}
        <div className="rounded-xl border border-slate-100 bg-[#FAFAFA] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">New Pack</p>
          <select
            value={selectedSubjectKey}
            onChange={(e) => setSelectedSubjectKey(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-slate-900"
          >
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <input
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            placeholder="Pack name…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
          />
          <select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="question_pattern">Question pattern</option>
            <option value="misconception_rule">Misconception rule</option>
            <option value="rubric_set">Rubric set</option>
            <option value="hint_ladder">Hint ladder</option>
            <option value="reflection_template">Reflection template</option>
            <option value="subject_playbook">Subject playbook</option>
          </select>
          <button
            type="button"
            onClick={() => createPackMutation.mutate()}
            disabled={createPackMutation.isPending || !packName.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors hover:bg-slate-800"
          >
            {createPackMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create pack
          </button>
        </div>

        {/* Pack list */}
        <div className="space-y-2">
          {assetsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading packs…
            </div>
          ) : assetsQuery.data?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-[#FAFAFA] p-6 text-center text-sm text-slate-400">
              No asset packs yet.
            </div>
          ) : (
            assetsQuery.data?.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedPackId(pack.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  selectedPack?.id === pack.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className={`font-semibold text-sm ${selectedPack?.id === pack.id ? "text-white" : "text-slate-950"}`}>
                  {pack.name}
                </div>
                <div className={`mt-1 text-xs ${selectedPack?.id === pack.id ? "text-slate-300" : "text-slate-500"}`}>
                  {pack.artifactType} &bull; {pack.status} &bull; {pack.targetScope}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Version Editor */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Version Editor</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedPack ? `Editing: ${selectedPack.name}` : "Select a pack to draft a version."}
          </p>
        </div>

        {selectedPack ? (
          <>
            <div className="space-y-3">
              <textarea
                value={artifactJson}
                onChange={(e) => setArtifactJson(e.target.value)}
                rows={10}
                className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 font-mono text-xs outline-none focus:ring-1 focus:ring-slate-900 transition-colors focus:bg-white"
              />
              <input
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                placeholder="Version notes…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => createVersionMutation.mutate()}
                disabled={createVersionMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800 transition-colors"
              >
                {createVersionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft version
              </button>
            </div>

            {/* Version history */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Version History</p>
              {versionsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
                </div>
              ) : versionsQuery.data?.length === 0 ? (
                <div className="text-sm text-slate-400">No versions yet.</div>
              ) : (
                versionsQuery.data?.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#FAFAFA] p-4"
                  >
                    <div>
                      <div className="font-semibold text-sm text-slate-950">Version {version.version}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {version.status}
                        {version.notes ? ` — ${version.notes}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {version.releaseReadiness?.ready
                          ? `Ready${typeof version.releaseReadiness.passRate === "number" ? ` · ${Math.round(version.releaseReadiness.passRate * 100)}% pass rate` : ""}`
                          : version.releaseReadiness?.reason ?? "Readiness not available"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => activateVersionMutation.mutate(version.id)}
                      disabled={
                        activateVersionMutation.isPending ||
                        version.status === "approved" ||
                        !version.releaseReadiness?.ready
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-40 hover:bg-emerald-100 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Activate
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <BookOpenCheck className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-sm">Select a pack from the left to begin editing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
