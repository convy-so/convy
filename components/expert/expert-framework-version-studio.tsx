"use client";

import { useState } from "react";
import { ArrowUpCircle, FileJson2, Loader2, Save, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { createDefaultDeepFramework } from "@/lib/learning/framework-packages";

type FrameworkVersion = {
  id: string;
  frameworkId: string;
  version: number;
  status: string;
  notes: string | null;
  framework: Record<string, unknown>;
  createdAt: string;
};

type FrameworkDetail = {
  id: string;
  name: string;
  description: string | null;
  topicId: string | null;
  topicTitle: string | null;
  activeVersionId: string | null;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export function ExpertFrameworkVersionStudio({
  framework,
  initialVersions,
}: {
  framework: FrameworkDetail;
  initialVersions: FrameworkVersion[];
}) {
  const initialArtifact =
    initialVersions[0]?.framework ?? createDefaultDeepFramework();
  const [versions, setVersions] = useState(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState(framework.activeVersionId);
  const [artifactJson, setArtifactJson] = useState(
    JSON.stringify(initialArtifact, null, 2),
  );
  const [notes, setNotes] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isActivatingVersionId, setIsActivatingVersionId] = useState<string | null>(null);

  const handleCreateVersion = async () => {
    try {
      setIsSavingDraft(true);
      const artifact = JSON.parse(artifactJson) as Record<string, unknown>;
      const result = await fetchJson<{ success: true; data: FrameworkVersion }>(
        `/api/learning/expert/assets/${framework.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            artifact,
            notes: notes.trim() || undefined,
          }),
        },
      );

      setVersions((current) => [result.data, ...current]);
      setNotes("");
      toast.success("Draft version created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create version");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    try {
      setIsActivatingVersionId(versionId);
      await fetchJson(`/api/learning/expert/assets/${framework.id}/activate`, {
        method: "POST",
        body: JSON.stringify({ versionId }),
      });

      setVersions((current) =>
        current.map((version) => ({
          ...version,
          status: version.id === versionId ? "published" : version.status,
        })),
      );
      setActiveVersionId(versionId);
      toast.success("Framework version activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate version");
    } finally {
      setIsActivatingVersionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            {framework.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {framework.description || "Manage draft versions and publish the active tutoring framework."}
          </p>
          {framework.topicTitle ? (
            <div className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Topic: {framework.topicTitle}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3">
          {framework.topicId ? (
            <Link
              href="/expert/runtime-preview"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4" />
              Runtime preview
            </Link>
          ) : null}
          <Link
            href="/expert/frameworks"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to frameworks
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">
                Draft New Version
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Edit the full framework JSON and save it as a new draft version.
              </p>
            </div>
            <FileJson2 className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 space-y-3">
            <textarea
              value={artifactJson}
              onChange={(event) => setArtifactJson(event.target.value)}
              rows={22}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none focus:border-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-900"
            />
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Version notes"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
            <button
              type="button"
              onClick={handleCreateVersion}
              disabled={isSavingDraft}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800"
            >
              {isSavingDraft ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save draft version
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Version History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Publish the version that should drive the live runtime model.
          </p>

          <div className="mt-5 space-y-3">
            {versions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
                No versions yet.
              </div>
            ) : (
              versions.map((version) => {
                const isActive = activeVersionId === version.id;
                return (
                  <div
                    key={version.id}
                    className={`rounded-2xl border p-4 ${
                      isActive
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">
                          Version {version.version}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {new Date(version.createdAt).toLocaleDateString()} · {version.status}
                        </div>
                        {version.notes ? (
                          <div className="mt-2 text-sm text-slate-700">{version.notes}</div>
                        ) : null}
                      </div>
                      {isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleActivateVersion(version.id)}
                      disabled={Boolean(isActivatingVersionId) || isActive}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 hover:bg-slate-100"
                    >
                      {isActivatingVersionId === version.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      )}
                      Activate and publish
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
