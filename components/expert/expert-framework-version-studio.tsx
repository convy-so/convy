"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpCircle,
  FileJson2,
  GripVertical,
  Layers3,
  Loader2,
  Plus,
  Save,
  Trash2,
  Waypoints,
} from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";
import { buildFrameworkBrief, parseFrameworkBrief } from "@/lib/learning/framework-brief";
import { createDefaultDeepFramework } from "@/lib/learning/framework-presets";
import {
  expertFrameworkSchema,
  type ExpertFramework,
  type ExpertFrameworkExample,
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

function createExample(): ExpertFrameworkExample {
  return {
    id: crypto.randomUUID(),
    title: "",
    focusArea: "",
    studentMessage: "",
    tutorResponse: "",
    rationale: "",
  };
}

function listToText(values: string[]) {
  return values.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function reorderItemsById<T extends { id: string }>(
  items: T[],
  activeId: string,
  targetId: string,
) {
  if (activeId === targetId) {
    return items;
  }

  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
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

function ExampleEditor({
  title,
  description,
  examples,
  onChange,
}: {
  title: string;
  description: string;
  examples: ExpertFrameworkExample[];
  onChange: (examples: ExpertFrameworkExample[]) => void;
}) {
  const [draggedExampleId, setDraggedExampleId] = useState<string | null>(null);

  const updateExample = (
    exampleId: string,
    updater: (example: ExpertFrameworkExample) => ExpertFrameworkExample,
  ) => {
    onChange(examples.map((example) => (example.id === exampleId ? updater(example) : example)));
  };

  const removeExample = (exampleId: string) => {
    onChange(examples.filter((example) => example.id !== exampleId));
  };

  const addExample = () => {
    onChange([...examples, createExample()]);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={addExample}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Attach example
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {examples.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-400">
            No examples attached yet.
          </div>
        ) : (
          examples.map((example, index) => (
            <details
              key={example.id}
              open={!example.title || index === examples.length - 1}
              className="rounded-2xl border border-slate-200 bg-slate-50"
              draggable
              onDragStart={() => setDraggedExampleId(example.id)}
              onDragEnd={() => setDraggedExampleId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedExampleId || draggedExampleId === example.id) {
                  return;
                }

                onChange(reorderItemsById(examples, draggedExampleId, example.id));
                setDraggedExampleId(null);
              }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {example.title || "Untitled example"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {example.focusArea || "General"}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Student to Tutor
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    removeExample(example.id);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </summary>

              <div className="grid gap-4 border-t border-slate-200 px-4 py-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Example Title
                  </label>
                  <input
                    value={example.title}
                    onChange={(event) =>
                      updateExample(example.id, (current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Reveal a misconception before correcting"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Concept Or Focus Area
                  </label>
                  <input
                    value={example.focusArea}
                    onChange={(event) =>
                      updateExample(example.id, (current) => ({
                        ...current,
                        focusArea: event.target.value,
                      }))
                    }
                    placeholder="Newton's first law"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Student Moment
                  </label>
                  <textarea
                    value={example.studentMessage}
                    onChange={(event) =>
                      updateExample(example.id, (current) => ({
                        ...current,
                        studentMessage: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Student: I think force keeps the object moving."
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Ideal Tutor Move
                  </label>
                  <textarea
                    value={example.tutorResponse}
                    onChange={(event) =>
                      updateExample(example.id, (current) => ({
                        ...current,
                        tutorResponse: event.target.value,
                      }))
                    }
                    rows={5}
                    placeholder="Tutor: If no force were acting, what would you expect the motion to do next?"
                    className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Why This Example Fits
                  </label>
                  <textarea
                    value={example.rationale}
                    onChange={(event) =>
                      updateExample(example.id, (current) => ({
                        ...current,
                        rationale: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Explain why this example represents the intended teaching behavior."
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

export function ExpertFrameworkVersionStudio({
  framework,
  initialVersions,
}: {
  framework: FrameworkDetail;
  initialVersions: FrameworkVersion[];
}) {
  const initialArtifact = expertFrameworkSchema.parse(
    initialVersions[0]?.framework ?? createDefaultDeepFramework(),
  );
  const frameworkBrief = parseFrameworkBrief(framework.description);
  const [frameworkName, setFrameworkName] = useState(framework.name);
  const [frameworkBriefText, setFrameworkBriefText] = useState(frameworkBrief.brief);
  const [legacyFewShotExamples, setLegacyFewShotExamples] = useState(
    frameworkBrief.fewShotExamples,
  );
  const [versions, setVersions] = useState(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState(framework.activeVersionId);
  const [draftFramework, setDraftFramework] = useState<ExpertFramework>(initialArtifact);
  const [notes, setNotes] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingFrameworkDetails, setIsSavingFrameworkDetails] = useState(false);
  const [isActivatingVersionId, setIsActivatingVersionId] = useState<string | null>(null);

  const frameworkExampleCount = draftFramework.fewShotExamples.length;

  const handleSaveFrameworkDetails = async () => {
    if (!framework.courseId) {
      toast.error("This framework is missing its course link.");
      return;
    }

    if (!frameworkName.trim()) {
      toast.error("Framework name is required.");
      return;
    }

    try {
      setIsSavingFrameworkDetails(true);
      await fetchJson<{ success: true; data: { description: string; name: string } }>(
        "/api/learning/expert/frameworks",
        {
          method: "POST",
          body: JSON.stringify({
            courseId: framework.courseId,
            name: frameworkName.trim(),
            description:
              buildFrameworkBrief({
                brief: frameworkBriefText,
                fewShotExamples: legacyFewShotExamples,
              }) || undefined,
          }),
        },
      );

      toast.success("Framework details saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save framework details",
      );
    } finally {
      setIsSavingFrameworkDetails(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      setIsSavingDraft(true);
      const artifactResult = expertFrameworkSchema.safeParse(draftFramework);
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
            {frameworkName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {frameworkBriefText ||
              "Manage draft versions and publish the active tutoring framework."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {framework.courseTitle ? (
              <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Course: {framework.courseTitle}
              </div>
            ) : null}
            <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {frameworkExampleCount} framework-wide examples
            </div>
          </div>
          {framework.anchorTopicTitle ? (
            <div className="mt-2 text-xs text-slate-500">
              Anchor session: {framework.anchorTopicTitle}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3">
          <Link
            href="/expert/frameworks"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to frameworks
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  Version History
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Publish the version that should drive live tutoring.
                </p>
              </div>
              <Layers3 className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 space-y-3">
              {versions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
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
                            {new Date(version.createdAt).toLocaleDateString()} - {version.status}
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

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  Framework Setup
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define the course-level framing here, then shape the runtime flow and examples below.
                </p>
              </div>
              <Save className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Framework Name
                </label>
                <input
                  value={frameworkName}
                  onChange={(event) => setFrameworkName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Teaching Brief
                </label>
                <textarea
                  value={frameworkBriefText}
                  onChange={(event) => setFrameworkBriefText(event.target.value)}
                  rows={7}
                  placeholder="Explain the teaching intent, expected tutor behavior, and the kinds of moves this framework should enforce."
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {legacyFewShotExamples ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Legacy examples from the older format are still preserved here until you move them into the structured example sections below.
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSaveFrameworkDetails}
                disabled={isSavingFrameworkDetails}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50 hover:bg-slate-50"
              >
                {isSavingFrameworkDetails ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save framework details
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  Framework Overview
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Shape the overall teaching flow first, then attach examples where they matter.
                </p>
              </div>
              <FileJson2 className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Runtime Framework Name
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

              <div className="lg:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Runtime Description
                </label>
                <textarea
                  value={draftFramework.description}
                  onChange={(event) =>
                    setDraftFramework((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Describe how the teaching flow should feel in practice."
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </section>

          <ExampleEditor
            title="Framework-wide Examples"
            description="Attach examples that should influence the whole framework regardless of stage."
            examples={draftFramework.fewShotExamples}
            onChange={(examples) =>
              setDraftFramework((current) => ({
                ...current,
                fewShotExamples: examples,
              }))
            }
          />



          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  Save Draft Version
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Save this structured framework as the next draft version.
                </p>
              </div>
              <Save className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 space-y-3">
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
        </div>
      </div>
    </div>
  );
}
