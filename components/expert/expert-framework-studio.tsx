"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, Plus, X } from "lucide-react";
import toast from "react-hot-toast";

import { useRouter } from "@/i18n/routing";

type FrameworkSummary = {
  id: string | null;
  courseId: string;
  courseKey: string;
  courseTitle: string;
  name: string;
  description: string | null;
  topicId: string | null;
  anchorTopicTitle: string | null;
  activeVersionId: string | null;
  updatedAt: string | null;
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
}: {
  initialFrameworks: FrameworkSummary[];
}) {
  const router = useRouter();
  const [frameworks, setFrameworks] = useState(initialFrameworks);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialFrameworks[0]?.courseId ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);

  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const selectedFramework = useMemo(
    () =>
      frameworks.find((framework) => framework.courseId === selectedCourseId) ?? null,
    [frameworks, selectedCourseId],
  );

  const openStudio = async () => {
    if (!selectedCourseId) {
      toast.error("Please select or create a course first");
      return;
    }

    if (selectedFramework?.id) {
      router.push(`/expert/frameworks/${selectedFramework.id}/versions`);
      return;
    }

    try {
      setIsSaving(true);
      const result = await fetchJson<{
        success: true;
        data: {
          id: string;
          courseId: string;
          courseKey: string;
          courseTitle: string;
          name: string;
          description: string;
          topicId: string | null;
          anchorTopicTitle: string | null;
          activeVersionId: string | null;
        };
      }>("/api/learning/expert/frameworks", {
        method: "POST",
        body: JSON.stringify({
          courseId: selectedCourseId,
          name: `${selectedFramework?.courseTitle ?? "Course"} DEEP Framework`,
        }),
      });

      const nextFramework: FrameworkSummary = {
        ...result.data,
        description: result.data.description || null,
        updatedAt: new Date().toISOString(),
      };

      setFrameworks((current) => {
        const existingIndex = current.findIndex(
          (item) => item.courseId === nextFramework.courseId,
        );
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

      toast.success("Framework created");
      router.push(`/expert/frameworks/${result.data.id}/versions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open studio");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseTitle.trim()) {
      toast.error("Course title is required");
      return;
    }

    try {
      setIsCreatingCourse(true);
      const result = await fetchJson<{
        success: true;
        data: {
          id: string;
          key: string;
          title: string;
          description: string | null;
        };
      }>("/api/learning/expert/courses", {
        method: "POST",
        body: JSON.stringify({
          title: newCourseTitle,
          description: newCourseDescription,
        }),
      });

      const newFramework: FrameworkSummary = {
        id: null,
        courseId: result.data.id,
        courseKey: result.data.key,
        courseTitle: result.data.title,
        name: `${result.data.title} DEEP`,
        description: result.data.description,
        topicId: null,
        anchorTopicTitle: null,
        activeVersionId: null,
        updatedAt: null,
      };

      setFrameworks((current) => [...current, newFramework]);
      setSelectedCourseId(result.data.id);
      setNewCourseTitle("");
      setNewCourseDescription("");
      setShowCreateForm(false);
      toast.success("Course created successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create course");
    } finally {
      setIsCreatingCourse(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Framework Studio
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pick an existing course and open its framework studio to customize the brief and few-shot examples.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Select Course
                </label>
              </div>

              {frameworks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No courses are available yet. Add a course using the panel on the right to start building frameworks!
                </div>
              ) : (
                <select
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                >
                  {frameworks.map((framework) => (
                    <option key={framework.courseId} value={framework.courseId}>
                      {framework.courseTitle}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedCourseId && selectedFramework && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-950">
                  {selectedFramework.id ? "Existing framework ready" : "Studio will create the framework for you"}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedFramework.id
                    ? `Open the "${selectedFramework.courseTitle}" studio to edit the learning framework description and attach few-shot tutoring examples.`
                    : `If "${selectedFramework.courseTitle}" does not have a learning framework yet, opening the studio will create one automatically and take you straight there.`}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={openStudio}
            disabled={isSaving || !selectedCourseId}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800 transition shadow-sm"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {selectedFramework?.id ? "Open Framework Studio" : "Create and Open Studio"}
          </button>
        </div>
      </section>

      {/* Modern Sidebar Course Creator */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
        <div className="mb-4">
          <h3 className="text-md font-bold tracking-tight text-slate-950 flex items-center gap-2">
            Create Course
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Experts create courses first, then establish frameworks on top of them.
          </p>
        </div>

        <form onSubmit={handleCreateCourse} className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Course Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Advanced Astrophysics"
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Description
              </label>
              <textarea
                placeholder="Brief summary of this course's topics and learning target"
                value={newCourseDescription}
                onChange={(e) => setNewCourseDescription(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreatingCourse || !newCourseTitle.trim()}
            className="w-full mt-4 inline-flex justify-center items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800 transition shadow-sm"
          >
            {isCreatingCourse ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add New Course
          </button>
        </form>
      </section>
    </div>
  );
}
