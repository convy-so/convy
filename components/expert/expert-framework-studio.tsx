"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, GitBranch, Loader2, PencilLine, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { Link } from "@/i18n/routing";

type FrameworkSummary = {
  id: string;
  name: string;
  description: string | null;
  topicId: string | null;
  topicTitle: string | null;
  activeVersionId: string | null;
  updatedAt: string;
};

type TopicOption = {
  id: string;
  title: string;
  subject: string;
  contentLocale: string;
  classroomTitle: string;
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

export function ExpertFrameworkStudio({
  initialFrameworks,
  topics,
}: {
  initialFrameworks: FrameworkSummary[];
  topics: TopicOption[];
}) {
  const [frameworks, setFrameworks] = useState(initialFrameworks);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(
    initialFrameworks[0]?.id ?? null,
  );
  const [topicId, setTopicId] = useState(initialFrameworks[0]?.topicId ?? topics[0]?.id ?? "");
  const [name, setName] = useState(initialFrameworks[0]?.name ?? "");
  const [description, setDescription] = useState(initialFrameworks[0]?.description ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const selectedFramework =
    frameworks.find((framework) => framework.id === selectedFrameworkId) ?? null;

  useEffect(() => {
    if (!selectedFramework) return;
    setTopicId(selectedFramework.topicId ?? "");
    setName(selectedFramework.name);
    setDescription(selectedFramework.description ?? "");
  }, [selectedFramework]);

  const handleSubmit = async () => {
    if (!topicId || !name.trim()) {
      toast.error("Topic and framework name are required");
      return;
    }

    try {
      setIsSaving(true);
      const result = await fetchJson<{
        success: true;
        data: {
          id: string;
          name: string;
          description: string;
          topicId: string;
          activeVersionId: string | null;
        };
      }>("/api/learning/expert/frameworks", {
        method: "POST",
        body: JSON.stringify({
          topicId,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      const topic = topics.find((item) => item.id === result.data.topicId);
      const nextFramework: FrameworkSummary = {
        id: result.data.id,
        name: result.data.name,
        description: result.data.description || null,
        topicId: result.data.topicId,
        topicTitle: topic?.title ?? null,
        activeVersionId: result.data.activeVersionId,
        updatedAt: new Date().toISOString(),
      };

      setFrameworks((current) => {
        const existingIndex = current.findIndex((item) => item.id === nextFramework.id);
        if (existingIndex === -1) {
          return [nextFramework, ...current];
        }
        const copy = [...current];
        copy[existingIndex] = {
          ...copy[existingIndex],
          ...nextFramework,
        };
        return copy;
      });
      setSelectedFrameworkId(nextFramework.id);
      toast.success(selectedFramework ? "Framework updated" : "Framework created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save framework");
    } finally {
      setIsSaving(false);
    }
  };

  const startNewFramework = () => {
    setSelectedFrameworkId(null);
    setTopicId(topics[0]?.id ?? "");
    setName("");
    setDescription("");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Framework Library
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              One framework per topic, versioned over time.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewFramework}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {frameworks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
              No frameworks yet.
            </div>
          ) : (
            frameworks.map((framework) => {
              const isSelected = framework.id === selectedFrameworkId;
              return (
                <button
                  key={framework.id}
                  type="button"
                  onClick={() => setSelectedFrameworkId(framework.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`font-semibold text-sm ${isSelected ? "text-white" : "text-slate-950"}`}>
                        {framework.name}
                      </div>
                      <div className={`mt-1 text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                        {framework.topicTitle ?? "Unlinked topic"}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {framework.activeVersionId ? "active" : "draft"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              {selectedFramework ? "Edit Framework" : "Create Framework"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Name the framework, bind it to a topic, then manage versions from the dedicated editor.
            </p>
          </div>
          {selectedFramework ? (
            <Link
              href={`/expert/frameworks/${selectedFramework.id}/versions`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <GitBranch className="h-4 w-4" />
              Open versions
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Topic
              </label>
              <select
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              >
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} · {topic.subject}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Framework Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="DEEP Algebra I"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Description
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="What tutoring behavior this framework should enforce."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || !topicId || !name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedFramework ? (
                <PencilLine className="h-4 w-4" />
              ) : (
                <BookOpenCheck className="h-4 w-4" />
              )}
              {selectedFramework ? "Update framework" : "Create framework"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Topic Context
            </div>
            {topicId ? (
              (() => {
                const topic = topics.find((item) => item.id === topicId);
                return topic ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{topic.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {topic.classroomTitle}
                      </div>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-600">
                      <div className="rounded-xl bg-white px-3 py-2">
                        Subject: {topic.subject}
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        Locale: {topic.contentLocale}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()
            ) : (
              <div className="mt-4 text-sm text-slate-400">
                Select a topic to see context.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
