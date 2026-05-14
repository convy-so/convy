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

type FrameworkSummary = {
  id: string;
  name: string;
  artifactType: string;
  status: string;
  targetScope: string;
  activeVersionId: string | null;
  metadata: Record<string, unknown>;
};

type FrameworkVersionSummary = {
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
      errorMessage =
        getFriendlyActionError((payload as { error: unknown }).error) || errorMessage;
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

const DEFAULT_FRAMEWORK_ARTIFACT = JSON.stringify(
  {
    title: "Reasoning-first framework",
    instructions: [
      "Ask for an attempt before teaching.",
      "Accept multiple valid strategies when the discipline allows it.",
    ],
  },
  null,
  2,
);

export function ExpertFrameworkLibraryStudio() {
  const queryClient = useQueryClient();
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [frameworkName, setFrameworkName] = useState("");
  const [artifactType, setArtifactType] = useState("question_pattern");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("mathematics");
  const [versionNotes, setVersionNotes] = useState("");
  const [frameworkArtifactJson, setFrameworkArtifactJson] = useState(
    DEFAULT_FRAMEWORK_ARTIFACT,
  );

  const frameworksQuery = useQuery({
    queryKey: ["expertLearningFrameworks"],
    queryFn: async () =>
      (
        await fetchJson<{ success: true; data: FrameworkSummary[] }>(
          "/api/learning/expert/frameworks",
        )
      ).data,
  });

  const selectedFramework =
    frameworksQuery.data?.find((framework) => framework.id === selectedFrameworkId) ??
    frameworksQuery.data?.[0] ??
    null;
  const selectedSubjectLabel =
    SUBJECT_OPTIONS.find((subject) => subject.key === selectedSubjectKey)?.label ??
    selectedSubjectKey;

  const versionsQuery = useQuery({
    queryKey: ["expertLearningFrameworkVersions", selectedFramework?.id],
    queryFn: async () =>
      (
        await fetchJson<{ success: true; data: FrameworkVersionSummary[] }>(
          `/api/learning/expert/frameworks/${selectedFramework!.id}/versions`,
        )
      ).data,
    enabled: Boolean(selectedFramework?.id),
  });

  const createFrameworkMutation = useMutation({
    mutationFn: async () => {
      if (!frameworkName.trim()) {
        throw new Error("Framework name is required.");
      }
      return (
        await fetchJson<{ success: true; data: FrameworkSummary }>(
          "/api/learning/expert/frameworks",
          {
            method: "POST",
            body: JSON.stringify({
              name: frameworkName.trim(),
              artifactType,
              targetScope: "subject",
              metadata: {
                program: "germany_secondary",
                curriculumFrameworkKey: "kmk_de_sek1",
                subjectKey: selectedSubjectKey,
                subjectLabel: selectedSubjectLabel,
              },
            }),
          },
        )
      ).data;
    },
    onSuccess: async (framework) => {
      setFrameworkName("");
      setSelectedFrameworkId(framework.id);
      toast.success("Framework created");
      await queryClient.invalidateQueries({ queryKey: ["expertLearningFrameworks"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create framework"),
  });

  const createFrameworkVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFramework) {
        throw new Error("Pick a framework first.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(frameworkArtifactJson);
      } catch {
        throw new Error("Invalid JSON in framework editor.");
      }
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/frameworks/${selectedFramework.id}/versions`,
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
        queryClient.invalidateQueries({
          queryKey: ["expertLearningFrameworkVersions", selectedFramework?.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["expertLearningFrameworks"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save version"),
  });

  const activateFrameworkVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      if (!selectedFramework) {
        throw new Error("Pick a framework first.");
      }
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/frameworks/${selectedFramework.id}/activate`,
        { method: "POST", body: JSON.stringify({ versionId }) },
      );
    },
    onSuccess: async () => {
      toast.success("Version activated");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["expertLearningFrameworkVersions", selectedFramework?.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["expertLearningFrameworks"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to activate version"),
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Frameworks</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create versioned pedagogical frameworks per subject.
            </p>
          </div>
          <BookOpenCheck className="h-5 w-5 text-slate-400" />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 bg-[#FAFAFA] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            New Framework
          </p>
          <select
            value={selectedSubjectKey}
            onChange={(event) => setSelectedSubjectKey(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-slate-900"
          >
            {SUBJECT_OPTIONS.map((subject) => (
              <option key={subject.key} value={subject.key}>
                {subject.label}
              </option>
            ))}
          </select>
          <input
            value={frameworkName}
            onChange={(event) => setFrameworkName(event.target.value)}
            placeholder="Framework name..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
          />
          <select
            value={artifactType}
            onChange={(event) => setArtifactType(event.target.value)}
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
            onClick={() => createFrameworkMutation.mutate()}
            disabled={createFrameworkMutation.isPending || !frameworkName.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {createFrameworkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create framework
          </button>
        </div>

        <div className="space-y-2">
          {frameworksQuery.isLoading ? (
            <div className="flex items-center gap-2 p-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading frameworks...
            </div>
          ) : frameworksQuery.data?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-[#FAFAFA] p-6 text-center text-sm text-slate-400">
              No frameworks yet.
            </div>
          ) : (
            frameworksQuery.data?.map((framework) => (
              <button
                key={framework.id}
                type="button"
                onClick={() => setSelectedFrameworkId(framework.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  selectedFramework?.id === framework.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    selectedFramework?.id === framework.id
                      ? "text-white"
                      : "text-slate-950"
                  }`}
                >
                  {framework.name}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    selectedFramework?.id === framework.id
                      ? "text-slate-300"
                      : "text-slate-500"
                  }`}
                >
                  {framework.artifactType} &bull; {framework.status} &bull;{" "}
                  {framework.targetScope}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Version Editor
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedFramework
              ? `Editing: ${selectedFramework.name}`
              : "Select a framework to draft a version."}
          </p>
        </div>

        {selectedFramework ? (
          <>
            <div className="space-y-3">
              <textarea
                value={frameworkArtifactJson}
                onChange={(event) => setFrameworkArtifactJson(event.target.value)}
                rows={10}
                className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 font-mono text-xs outline-none transition-colors focus:bg-white focus:ring-1 focus:ring-slate-900"
              />
              <input
                value={versionNotes}
                onChange={(event) => setVersionNotes(event.target.value)}
                placeholder="Version notes..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => createFrameworkVersionMutation.mutate()}
                disabled={createFrameworkVersionMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {createFrameworkVersionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save draft version
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Version History
              </p>
              {versionsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading versions...
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
                      <div className="text-sm font-semibold text-slate-950">
                        Version {version.version}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {version.status}
                        {version.notes ? ` - ${version.notes}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {version.releaseReadiness?.ready
                          ? `Ready${
                              typeof version.releaseReadiness.passRate === "number"
                                ? ` - ${Math.round(version.releaseReadiness.passRate * 100)}% pass rate`
                                : ""
                            }`
                          : version.releaseReadiness?.reason ?? "Readiness not available"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => activateFrameworkVersionMutation.mutate(version.id)}
                      disabled={
                        activateFrameworkVersionMutation.isPending ||
                        version.status === "approved" ||
                        !version.releaseReadiness?.ready
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40"
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
          <div className="flex h-48 flex-col items-center justify-center text-slate-400">
            <BookOpenCheck className="mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm">Select a framework from the left to begin editing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
