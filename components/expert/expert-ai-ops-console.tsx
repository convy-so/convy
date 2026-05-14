"use client";

import { useState } from "react";
import { z } from "zod";
import { BrainCircuit, CheckCircle2, Layers3, Loader2, Plus, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

import {
  activateExpertGuidanceVersion,
  createExpertGuidancePack,
  createExpertGuidanceVersion,
} from "@/app/actions/ai-ops";
import { getFriendlyActionError } from "@/lib/action-ux";

type GuidanceOverview = {
  viewerRole: string;
  totalRuns: number;
  weeklyRuns: number;
  failedRuns: number;
  evalDatasetCount: number;
  guidancePackCount: number;
  failureModeCount: number;
  featureBreakdown: unknown[];
};

type GuidanceVersion = {
  id: string;
  packId: string;
  version: number;
  status: string;
  notes: string | null;
  artifact: Record<string, unknown>;
};

type GuidancePack = {
  id: string;
  feature: string;
  artifactType: string;
  status: string;
  name: string;
  description: string | null;
  targetScope: string;
  activeVersionId: string | null;
  metadata: Record<string, unknown> | null;
};

const DEFAULT_GUIDANCE_ARTIFACT = JSON.stringify(
  {
    title: "Expert guidance artifact",
    instructions: [
      "Describe the target behavior clearly.",
      "Anchor examples in the real user workflow.",
    ],
  },
  null,
  2,
);

const FEATURE_OPTIONS = [
  "tutoring_chat",
  "tutoring_voice",
  "tutoring_media",
  "survey_creation",
  "survey_conducting",
  "survey_analytics",
  "survey_refinement",
  "memory_behavior",
] as const;

const ARTIFACT_OPTIONS = [
  "policy_pack",
  "prompt_playbook",
  "decision_rules",
  "rubric_set",
] as const;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export function ExpertAiOpsConsole({
  overview,
  packs,
  versionsByPackId,
}: {
  overview: GuidanceOverview;
  packs: GuidancePack[];
  versionsByPackId: Record<string, GuidanceVersion[]>;
}) {
  const router = useRouter();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(packs[0]?.id ?? null);
  const [isCreatingPack, setIsCreatingPack] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isActivatingVersionId, setIsActivatingVersionId] = useState<string | null>(null);

  const [feature, setFeature] = useState<(typeof FEATURE_OPTIONS)[number]>("tutoring_chat");
  const [artifactType, setArtifactType] = useState<(typeof ARTIFACT_OPTIONS)[number]>("policy_pack");
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [targetScope, setTargetScope] = useState("global");
  const [artifactJson, setArtifactJson] = useState(DEFAULT_GUIDANCE_ARTIFACT);
  const [versionNotes, setVersionNotes] = useState("");

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedVersions = selectedPack ? versionsByPackId[selectedPack.id] ?? [] : [];

  const handleCreatePack = async () => {
    try {
      setIsCreatingPack(true);
      const result = await createExpertGuidancePack({
        feature,
        artifactType,
        name: packName.trim(),
        description: packDescription.trim() || null,
        targetScope,
      });

      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }

      toast.success("Guidance pack created");
      setPackName("");
      setPackDescription("");
      router.refresh();
    } catch {
      toast.error("Failed to create guidance pack");
    } finally {
      setIsCreatingPack(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedPack) {
      toast.error("Select a guidance pack first");
      return;
    }

    try {
      setIsCreatingVersion(true);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(artifactJson);
      } catch {
        toast.error("Artifact JSON is invalid");
        return;
      }
      const artifactResult = jsonObjectSchema.safeParse(parsedJson);
      if (!artifactResult.success) {
        toast.error("Artifact JSON must be an object.");
        return;
      }

      const result = await createExpertGuidanceVersion({
        packId: selectedPack.id,
        artifact: artifactResult.data,
        notes: versionNotes.trim() || null,
      });

      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }

      toast.success("Guidance version created");
      setVersionNotes("");
      router.refresh();
    } catch {
      toast.error("Failed to create guidance version");
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    if (!selectedPack) return;

    try {
      setIsActivatingVersionId(versionId);
      const result = await activateExpertGuidanceVersion({
        packId: selectedPack.id,
        versionId,
      });

      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }

      toast.success("Guidance version activated");
      router.refresh();
    } catch {
      toast.error("Failed to activate version");
    } finally {
      setIsActivatingVersionId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Viewer Role", value: overview.viewerRole },
          { label: "Guidance Packs", value: String(overview.guidancePackCount) },
          { label: "Eval Datasets", value: String(overview.evalDatasetCount) },
          { label: "Failed Runs", value: String(overview.failedRuns) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              {card.label}
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  Guidance Packs
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define reusable expert instruction assets by feature.
                </p>
              </div>
              <BrainCircuit className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 space-y-3">
              <select
                value={feature}
                onChange={(event) => setFeature(event.target.value as (typeof FEATURE_OPTIONS)[number])}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              >
                {FEATURE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={artifactType}
                onChange={(event) => setArtifactType(event.target.value as (typeof ARTIFACT_OPTIONS)[number])}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              >
                {ARTIFACT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                value={packName}
                onChange={(event) => setPackName(event.target.value)}
                placeholder="Pack name"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              <textarea
                value={packDescription}
                onChange={(event) => setPackDescription(event.target.value)}
                rows={3}
                placeholder="What this pack governs"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              <input
                value={targetScope}
                onChange={(event) => setTargetScope(event.target.value)}
                placeholder="Target scope"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={handleCreatePack}
                disabled={isCreatingPack || !packName.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800"
              >
                {isCreatingPack ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create guidance pack
              </button>
            </div>

            <div className="mt-6 space-y-2">
              {packs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">
                  No guidance packs yet.
                </div>
              ) : (
                packs.map((pack) => {
                  const isSelected = selectedPack?.id === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setSelectedPackId(pack.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`font-semibold text-sm ${isSelected ? "text-white" : "text-slate-950"}`}>
                            {pack.name}
                          </div>
                          <div className={`mt-1 text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                            {pack.feature} · {pack.artifactType}
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>
                          {pack.status}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">
                Version Studio
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedPack
                  ? `Draft and activate versions for ${selectedPack.name}.`
                  : "Select a guidance pack to manage its versions."}
              </p>
            </div>
            <Layers3 className="h-5 w-5 text-slate-400" />
          </div>

          {selectedPack ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-3">
                  <textarea
                    value={artifactJson}
                    onChange={(event) => setArtifactJson(event.target.value)}
                    rows={16}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
                  />
                  <input
                    value={versionNotes}
                    onChange={(event) => setVersionNotes(event.target.value)}
                    placeholder="Version notes"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleCreateVersion}
                    disabled={isCreatingVersion}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800"
                  >
                    {isCreatingVersion ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save draft version
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedVersions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
                      No versions yet.
                    </div>
                  ) : (
                    selectedVersions.map((version) => {
                      const isActive = selectedPack.activeVersionId === version.id;
                      return (
                        <div
                          key={version.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">
                                Version {version.version}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {version.status}
                                {version.notes ? ` · ${version.notes}` : ""}
                              </div>
                            </div>
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleActivateVersion(version.id)}
                            disabled={isActivatingVersionId === version.id || isActive}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 hover:bg-slate-100"
                          >
                            {isActivatingVersionId === version.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Activate
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-sm text-slate-400">
              Select a guidance pack from the left to manage versions.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
