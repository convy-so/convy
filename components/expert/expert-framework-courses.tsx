"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import toast from "react-hot-toast";

import { ExpertFrameworkSubnav } from "@/components/expert/expert-framework-subnav";
import type { ExpertFrameworkCourseSummary } from "@/lib/learning/expert-framework-summaries";

type FrameworkStatus = "none" | "draft" | "live";

function frameworkStatus(row: ExpertFrameworkCourseSummary): FrameworkStatus {
  if (!row.id) return "none";
  if (row.activeVersionId) return "live";
  return "draft";
}

function statusLabel(status: FrameworkStatus) {
  if (status === "live") return "Live";
  if (status === "draft") return "Draft";
  return "Not started";
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

export function ExpertFrameworkCourses({
  initialFrameworks,
}: {
  initialFrameworks: ExpertFrameworkCourseSummary[];
}) {
  const [frameworks, setFrameworks] = useState(initialFrameworks);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);

  const handleCreateCourse = async (event: React.FormEvent) => {
    event.preventDefault();
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

      setFrameworks((current) => [
        ...current,
        {
          id: null,
          courseId: result.data.id,
          courseKey: result.data.key,
          courseTitle: result.data.title,
          name: null,
          description: result.data.description,
          topicId: null,
          anchorTopicTitle: null,
          activeVersionId: null,
          updatedAt: null,
        },
      ]);
      setNewCourseTitle("");
      setNewCourseDescription("");
      setShowAddCourse(false);
      toast.success("Course added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create course");
    } finally {
      setIsCreatingCourse(false);
    }
  };

  return (
    <div>
      <ExpertFrameworkSubnav
        title="Courses"
        description="Courses in the catalog. Each course can have one pedagogical framework."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <p className="text-sm text-slate-500">
          {frameworks.length} {frameworks.length === 1 ? "course" : "courses"}
        </p>
        <button
          type="button"
          onClick={() => setShowAddCourse((current) => !current)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-950"
        >
          {showAddCourse ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddCourse ? "Cancel" : "Add course"}
        </button>
      </div>

      {showAddCourse ? (
        <form
          onSubmit={handleCreateCourse}
          className="mt-6 max-w-lg space-y-4 border-b border-slate-200 pb-6"
        >
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Course title
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Advanced Astrophysics"
              value={newCourseTitle}
              onChange={(event) => setNewCourseTitle(event.target.value)}
              className="w-full border-0 border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Description
            </label>
            <textarea
              placeholder="Brief summary of topics and learning goals"
              value={newCourseDescription}
              onChange={(event) => setNewCourseDescription(event.target.value)}
              rows={3}
              className="w-full resize-none border-0 border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <button
            type="submit"
            disabled={isCreatingCourse || !newCourseTitle.trim()}
            className="text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {isCreatingCourse ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </span>
            ) : (
              "Create course"
            )}
          </button>
        </form>
      ) : null}

      {frameworks.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">No courses yet. Use Add course to create one.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Course catalog</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Course
                </th>
                <th scope="col" className="hidden py-3 pr-4 font-medium sm:table-cell">
                  Framework
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="hidden py-3 pr-4 font-medium md:table-cell">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {frameworks.map((row) => {
                const status = frameworkStatus(row);
                return (
                  <tr key={row.courseId} className="hover:bg-slate-50/80">
                    <td className="py-4 pr-4">
                      <div className="font-medium text-slate-950">{row.courseTitle}</div>
                      {row.description ? (
                        <p className="mt-0.5 line-clamp-1 text-slate-500">{row.description}</p>
                      ) : null}
                    </td>
                    <td className="hidden py-4 pr-4 text-slate-600 sm:table-cell">
                      {row.name ?? "—"}
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        className={
                          status === "live"
                            ? "text-emerald-700"
                            : status === "draft"
                              ? "text-slate-600"
                              : "text-slate-400"
                        }
                      >
                        {statusLabel(status)}
                      </span>
                    </td>
                    <td className="hidden py-4 pr-4 whitespace-nowrap text-slate-500 md:table-cell">
                      {row.updatedAt
                        ? new Date(row.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
