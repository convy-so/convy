"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  History,
  Loader2,
  PencilLine,
  Plus,
  Radio,
  Save,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { createDefaultDeepFramework } from "@/lib/learning/framework-presets";
import {
  expertFrameworkSchema,
  type ExpertFramework,
  frameworkRuntimeMetadataSchema,
  type FrameworkCompileIssue,
  type FrameworkRuntimeMetadata,
} from "@/lib/learning/types";

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
  courseId: string;
  courseKey: string;
  courseTitle: string;
  topicId: string | null;
  anchorTopicTitle: string | null;
  activeVersionId: string | null;
};

type StudioPanel = "editor" | "versions";
const FRAMEWORK_RUNTIME_METADATA_KEY = "__convyFrameworkRuntime";

function parseInitialArtifact(raw: Record<string, unknown> | undefined): ExpertFramework {
  const parsed = expertFrameworkSchema.safeParse(raw ?? createDefaultDeepFramework());
  return parsed.success ? parsed.data : createDefaultDeepFramework();
}

function normalizeDraftForSave(framework: ExpertFramework): ExpertFramework {
  return {
    ...framework,
    name: framework.name.trim(),
    description: framework.description.trim(),
    markdownContent: framework.markdownContent?.trim() ?? "",
    fewShotExamples: framework.fewShotExamples
      .map((example) => example.trim())
      .filter(Boolean),
  };
}

function formatVersionStatus(status: string) {
  if (status === "published") return "Published";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return status;
}

function readFrameworkRuntimeMetadata(
  raw: Record<string, unknown> | undefined,
): FrameworkRuntimeMetadata | null {
  const metadata = raw?.metadata;
  if (!metadata || typeof metadata !== "object") return null;

  const runtimeMetadata = (metadata as Record<string, unknown>)[
    FRAMEWORK_RUNTIME_METADATA_KEY
  ];
  const parsed = frameworkRuntimeMetadataSchema.safeParse(runtimeMetadata);
  return parsed.success ? parsed.data : null;
}

function countCompileIssues(
  issues: FrameworkCompileIssue[],
  severity: FrameworkCompileIssue["severity"],
) {
  return issues.filter((issue) => issue.severity === severity).length;
}

function formatCompileStatus(status: FrameworkRuntimeMetadata["compileStatus"]) {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Needs fixes";
  return "Needs review";
}

function getCompileStatusStyles(status: FrameworkRuntimeMetadata["compileStatus"]) {
  if (status === "ready") {
    return {
      badge:
        "border-emerald-200 bg-emerald-50 text-emerald-800",
      panel:
        "border-emerald-200 bg-emerald-50/60",
      icon: "text-emerald-600",
    };
  }

  if (status === "failed") {
    return {
      badge:
        "border-rose-200 bg-rose-50 text-rose-800",
      panel:
        "border-rose-200 bg-rose-50/60",
      icon: "text-rose-600",
    };
  }

  return {
    badge:
      "border-amber-200 bg-amber-50 text-amber-800",
    panel:
      "border-amber-200 bg-amber-50/60",
    icon: "text-amber-600",
  };
}

function canPublishVersion(metadata: FrameworkRuntimeMetadata | null) {
  return metadata?.compileStatus === "ready" && Boolean(metadata.compiledPolicy);
}

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
  const initialArtifact = parseInitialArtifact(initialVersions[0]?.framework);
  const [activePanel, setActivePanel] = useState<StudioPanel>("editor");
  const [versions, setVersions] = useState(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState(framework.activeVersionId);
  const [draftFramework, setDraftFramework] = useState<ExpertFramework>(initialArtifact);
  const [notes, setNotes] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isActivatingVersionId, setIsActivatingVersionId] = useState<string | null>(null);

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? null,
    [activeVersionId, versions],
  );
  const latestSavedVersion = versions[0] ?? null;
  const latestSavedRuntimeMetadata = latestSavedVersion
    ? readFrameworkRuntimeMetadata(latestSavedVersion.framework)
    : null;
  const latestSavedErrors = latestSavedRuntimeMetadata
    ? countCompileIssues(latestSavedRuntimeMetadata.issues, "error")
    : 0;
  const latestSavedWarnings = latestSavedRuntimeMetadata
    ? countCompileIssues(latestSavedRuntimeMetadata.issues, "warning")
    : 0;

  const exampleCount = draftFramework.fewShotExamples.filter((example) => example.trim()).length;

  const handleCreateVersion = async () => {
    try {
      setIsSavingDraft(true);
      const artifactResult = expertFrameworkSchema.safeParse(normalizeDraftForSave(draftFramework));
      if (!artifactResult.success) {
        toast.error(
          artifactResult.error.issues[0]?.message ?? "Framework is invalid",
        );
        return;
      }

      const result = await fetchJson<{ success: true; data: FrameworkVersion }>(
        `/api/learning/expert/frameworks/${framework.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            artifact: artifactResult.data,
            notes: notes.trim() || undefined,
          }),
        },
      );

      setVersions((current) => [result.data, ...current]);
      setDraftFramework(parseInitialArtifact(result.data.framework));
      setNotes("");
      toast.success("Draft version saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save version");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    try {
      setIsActivatingVersionId(versionId);
      await fetchJson(`/api/learning/expert/frameworks/${framework.id}/activate`, {
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
      toast.success("Version is now live for tutoring");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish version");
    } finally {
      setIsActivatingVersionId(null);
    }
  };

  return (
    <div className="space-y-0">
      <header className="space-y-4 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link
            href="/expert/frameworks"
            className="inline-flex items-center gap-1 font-medium text-slate-600 transition-colors hover:text-slate-950"
          >
            <ChevronLeft className="h-4 w-4" />
            Frameworks
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">{framework.courseTitle}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              Framework studio
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              Edit the tutoring framework in one place, save versions, then publish the one
              that should run live.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeVersion ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <Radio className="h-3 w-3 fill-emerald-600 text-emerald-600" />
                  Live: Version {activeVersion.version}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <CircleDot className="h-3 w-3" />
                  No live version yet
                </span>
              )}
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {exampleCount} {exampleCount === 1 ? "example" : "examples"} in workspace
              </span>
              {framework.anchorTopicTitle ? (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Anchor: {framework.anchorTopicTitle}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <nav className="-mb-px flex gap-6 border-b border-slate-200 lg:border-b-0">
            <button
              type="button"
              onClick={() => setActivePanel("editor")}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors ${
                activePanel === "editor"
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              <PencilLine className="h-4 w-4" />
              Editor
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("versions")}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors ${
                activePanel === "versions"
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              <History className="h-4 w-4" />
              Versions
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {versions.length}
              </span>
            </button>
          </nav>

          {activePanel === "editor" ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Version note (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:min-w-[220px]"
              />
              <button
                type="button"
                onClick={handleCreateVersion}
                disabled={isSavingDraft}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800"
              >
                {isSavingDraft ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save draft
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {activePanel === "editor" ? (
        <div className="pt-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <section className="border-b border-slate-100 px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-base font-bold text-slate-950">Runtime diagnostics</h2>
                  <p className="max-w-2xl text-sm text-slate-500">
                    The platform validates the last saved draft and compiles it into the
                    internal tutoring policy used at runtime. Unsaved edits are not checked
                    until you save another draft.
                  </p>
                </div>
                {latestSavedRuntimeMetadata ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${getCompileStatusStyles(latestSavedRuntimeMetadata.compileStatus).badge}`}
                  >
                    {latestSavedRuntimeMetadata.compileStatus === "ready" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {formatCompileStatus(latestSavedRuntimeMetadata.compileStatus)}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    Save a draft to validate
                  </span>
                )}
              </div>

              {latestSavedRuntimeMetadata ? (
                <div
                  className={`mt-5 rounded-2xl border px-4 py-4 ${getCompileStatusStyles(latestSavedRuntimeMetadata.compileStatus).panel}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        Latest saved draft: Version {latestSavedVersion?.version}
                      </p>
                      <p className="text-sm text-slate-600">
                        {latestSavedRuntimeMetadata.compileStatus === "ready"
                          ? "This version is ready to publish and can power live tutoring."
                          : "This version is not yet publish-ready. Fix the issues below, then save another draft."}
                      </p>
                      {latestSavedRuntimeMetadata.compiledAt ? (
                        <p className="text-xs text-slate-500">
                          Checked{" "}
                          {new Date(latestSavedRuntimeMetadata.compiledAt).toLocaleString(
                            undefined,
                            {
                              dateStyle: "medium",
                              timeStyle: "short",
                            },
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">
                        {latestSavedErrors} errors
                      </span>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">
                        {latestSavedWarnings} warnings
                      </span>
                    </div>
                  </div>

                  {latestSavedRuntimeMetadata.issues.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {latestSavedRuntimeMetadata.issues.map((issue, index) => (
                        <div
                          key={`${issue.code}-${index}`}
                          className="rounded-xl border border-white/70 bg-white/80 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                issue.severity === "error"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {issue.severity}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                              {issue.message}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-600">
                      No compiler issues were detected for the latest saved draft.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  Save a draft to see whether the framework is publish-ready, what the tutor
                  can enforce from it, and which issues still need fixing.
                </div>
              )}
            </section>

            <section className="border-b border-slate-100 px-6 py-6 sm:px-8">
              <div className="mb-5">
                <h2 className="text-base font-bold text-slate-950">Framework</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Name and description are injected into the live tutor when you publish a
                  version.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Name
                  </label>
                  <input
                    value={draftFramework.name}
                    onChange={(event) =>
                      setDraftFramework((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Description
                  </label>
                  <textarea
                    value={draftFramework.description}
                    onChange={(event) =>
                      setDraftFramework((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={5}
                    placeholder="Describe how the teaching flow should feel in practice."
                    className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Framework Guidelines & Instructions (Markdown)
                  </label>
                  <textarea
                    value={draftFramework.markdownContent}
                    onChange={(event) =>
                      setDraftFramework((current) => ({
                        ...current,
                        markdownContent: event.target.value,
                      }))
                    }
                    rows={12}
                    placeholder="Enter the full mathematical teaching framework in Markdown format. Outline diagnostic rungs, conceptual progression, and pedagogical rules."
                    className="min-h-[280px] w-full font-mono rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>
            </section>

            <section className="px-6 py-6 sm:px-8">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Teaching examples</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Free-form reference examples for the whole framework. Empty blocks are
                    skipped when you save.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftFramework((current) => ({
                      ...current,
                      fewShotExamples: [...current.fewShotExamples, ""],
                    }))
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add example
                </button>
              </div>

              {draftFramework.fewShotExamples.length === 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraftFramework((current) => ({
                      ...current,
                      fewShotExamples: [""],
                    }))
                  }
                  className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <Plus className="mb-3 h-5 w-5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">
                    Add your first example
                  </span>
                  <span className="mt-1 max-w-md text-sm text-slate-500">
                    Use any format you like — student moments, ideal tutor moves, or notes.
                  </span>
                </button>
              ) : (
                <div className="space-y-4">
                  {draftFramework.fewShotExamples.map((example, index) => (
                    <div
                      key={index}
                      className="group rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                          Example {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftFramework((current) => ({
                              ...current,
                              fewShotExamples: current.fewShotExamples.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            }))
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-0 transition-all hover:bg-white hover:text-rose-600 group-hover:opacity-100"
                          aria-label={`Remove example ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={example}
                        onChange={(event) =>
                          setDraftFramework((current) => ({
                            ...current,
                            fewShotExamples: current.fewShotExamples.map(
                              (currentExample, currentIndex) =>
                                currentIndex === index
                                  ? event.target.value
                                  : currentExample,
                            ),
                          }))
                        }
                        rows={6}
                        placeholder="Write the example in any format you prefer."
                        className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Changes here are a working copy until you save a draft and publish a version from
            the Versions tab.
          </p>
        </div>
      ) : (
        <div className="pt-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {versions.length === 0 ? (
              <div className="px-6 py-16 text-center sm:px-8">
                <History className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-4 text-sm font-semibold text-slate-700">No versions yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Save a draft from the Editor tab, then publish it here.
                </p>
                <button
                  type="button"
                  onClick={() => setActivePanel("editor")}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <PencilLine className="h-4 w-4" />
                  Go to editor
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      <th className="px-6 py-3 sm:px-8">Version</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Compile</th>
                      <th className="px-4 py-3">Saved</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-6 py-3 text-right sm:px-8">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {versions.map((version) => {
                      const isLive = activeVersionId === version.id;
                      const runtimeMetadata = readFrameworkRuntimeMetadata(version.framework);
                      const publishReady = canPublishVersion(runtimeMetadata);
                      const errorCount = runtimeMetadata
                        ? countCompileIssues(runtimeMetadata.issues, "error")
                        : 0;
                      const warningCount = runtimeMetadata
                        ? countCompileIssues(runtimeMetadata.issues, "warning")
                        : 0;
                      const firstBlockingIssue = runtimeMetadata?.issues.find(
                        (issue) => issue.severity === "error",
                      );
                      return (
                        <tr
                          key={version.id}
                          className={isLive ? "bg-emerald-50/40" : "bg-white"}
                        >
                          <td className="px-6 py-4 font-semibold text-slate-950 sm:px-8">
                            <div className="flex items-center gap-2">
                              Version {version.version}
                              {isLive ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  Live
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatVersionStatus(version.status)}
                          </td>
                          <td className="px-4 py-4">
                            {runtimeMetadata ? (
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getCompileStatusStyles(runtimeMetadata.compileStatus).badge}`}
                                >
                                  {runtimeMetadata.compileStatus === "ready" ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <AlertTriangle className="h-3 w-3" />
                                  )}
                                  {formatCompileStatus(runtimeMetadata.compileStatus)}
                                </span>
                                <p className="text-xs text-slate-500">
                                  {errorCount} errors, {warningCount} warnings
                                </p>
                                {firstBlockingIssue ? (
                                  <p className="max-w-xs text-xs text-rose-600">
                                    {firstBlockingIssue.message}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Not checked</span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                            {new Date(version.createdAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="max-w-xs px-4 py-4 text-slate-600">
                            {version.notes ? (
                              <span className="line-clamp-2">{version.notes}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right sm:px-8">
                            <button
                              type="button"
                              onClick={() => handleActivateVersion(version.id)}
                              disabled={
                                Boolean(isActivatingVersionId) ||
                                isLive ||
                                !publishReady
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                              title={
                                publishReady
                                  ? undefined
                                  : "This version must compile successfully before it can be published."
                              }
                            >
                              {isActivatingVersionId === version.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArrowUpCircle className="h-3.5 w-3.5" />
                              )}
                              {isLive ? "Published" : "Publish"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Publishing switches the live tutoring framework to that snapshot. Save new edits in
            the Editor first if you need another draft.
          </p>
        </div>
      )}
    </div>
  );
}
