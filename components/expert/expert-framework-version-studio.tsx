"use client";

import { useState } from "react";
import {
  ArrowUpCircle,
  ChevronLeft,
  History,
  Loader2,
  PencilLine,
} from "lucide-react";
import toast from "react-hot-toast";

import { FrameworkEditorWizard } from "@/components/expert/framework-editor-wizard";
import { Link } from "@/i18n/routing";
import { createEmptyExpertFramework } from "@/lib/learning/framework-presets";
import {
  expertFrameworkSchema,
  type ExpertFramework,
} from "@/lib/learning/types";

type FrameworkVersion = {
  id: string;
  frameworkId: string;
  version: number;
  status: string;
  seedSource?: string | null;
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

function parseInitialArtifact(
  raw: Record<string, unknown> | undefined,
  frameworkName: string,
): ExpertFramework {
  const fallback = createEmptyExpertFramework({ name: frameworkName });
  const parsed = expertFrameworkSchema.safeParse(raw ?? fallback);
  return parsed.success ? parsed.data : fallback;
}

function normalizeDraftForSave(framework: ExpertFramework): ExpertFramework {
  return {
    ...framework,
    name: framework.name.trim(),
    description: framework.description.trim(),
    toolUsageGuidance: framework.toolUsageGuidance.trim(),
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

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as
    | ({ success: false; error?: { code?: string; message?: string; details?: Record<string, unknown> } })
    | ({ success?: true } & T);
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Request failed",
    );
  }
  return payload as T;
}

export function ExpertFrameworkVersionStudio({
  framework,
  initialVersions,
}: {
  framework: FrameworkDetail;
  initialVersions: FrameworkVersion[];
}) {
  const initialArtifact = parseInitialArtifact(
    initialVersions[0]?.framework,
    framework.name,
  );
  const [activePanel, setActivePanel] = useState<StudioPanel>("editor");
  const [versions, setVersions] = useState(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState(framework.activeVersionId);
  const [draftFramework, setDraftFramework] = useState<ExpertFramework>(initialArtifact);
  const [notes, setNotes] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isActivatingVersionId, setIsActivatingVersionId] = useState<string | null>(null);

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
      setDraftFramework(
        parseInitialArtifact(result.data.framework, framework.name),
      );
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
      toast.success("Version published for tutoring");
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
              Build your framework step by step, save a draft when ready, then publish from
              Versions.
            </p>
            {framework.anchorTopicTitle ? (
              <p className="text-sm text-slate-500">
                Anchor topic: {framework.anchorTopicTitle}
              </p>
            ) : null}
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

        </div>
      </header>

      {activePanel === "editor" ? (
        <div className="pt-6">
          <FrameworkEditorWizard
            key={versions[0]?.id ?? "new"}
            draftFramework={draftFramework}
            setDraftFramework={setDraftFramework}
            notes={notes}
            setNotes={setNotes}
            onSaveDraft={handleCreateVersion}
            isSavingDraft={isSavingDraft}
          />
        </div>
      ) : (
        <div className="pt-6">
          <div className="border-t border-slate-200">
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
                      <th className="px-4 py-3">Saved</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-6 py-3 text-right sm:px-8">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {versions.map((version) => {
                      const isPublished = activeVersionId === version.id;
                      return (
                        <tr key={version.id}>
                          <td className="px-6 py-4 font-semibold text-slate-950 sm:px-8">
                            Version {version.version}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatVersionStatus(version.status)}
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
                              disabled={Boolean(isActivatingVersionId) || isPublished}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                            >
                              {isActivatingVersionId === version.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArrowUpCircle className="h-3.5 w-3.5" />
                              )}
                              {isPublished ? "Published" : "Publish"}
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
            Publishing makes that version active for tutoring. Save new edits in the Editor first
            if you need another draft.
          </p>
        </div>
      )}
    </div>
  );
}
