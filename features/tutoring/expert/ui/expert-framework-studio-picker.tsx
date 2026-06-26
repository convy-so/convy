"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { ExpertFrameworkSubnav } from "@/features/tutoring/expert/ui/expert-framework-subnav";
import { useRouter } from "@/i18n/routing";
import type { ExpertFrameworkCourseSummary } from "@/features/tutoring/server/expert-framework-summaries";
import { cn } from "@/shared/ui/tailwind-class-utils";

type CourseFrameworkRecord = {
  id: string;
  name: string;
  status: "draft" | "active" | "inactive" | "archived";
  updatedAt: string;
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

export function ExpertFrameworkStudioPicker({
  initialFrameworks,
}: {
  initialFrameworks: ExpertFrameworkCourseSummary[];
}) {
  const router = useRouter();
  const [courses] = useState(initialFrameworks);
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialFrameworks[0]?.courseId ?? "",
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [frameworks, setFrameworks] = useState<CourseFrameworkRecord[]>([]);
  const [isLoadingFrameworks, setIsLoadingFrameworks] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((row) => row.courseId === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  useEffect(() => {
    if (!selectedCourseId) {
      setFrameworks([]);
      return;
    }

    let cancelled = false;

    async function loadFrameworks() {
      try {
        setIsLoadingFrameworks(true);
        const result = await fetchJson<{
          success: true;
          data: { frameworks: CourseFrameworkRecord[] };
        }>(`/api/expert/courses/${selectedCourseId}/frameworks`);
        if (!cancelled) {
          setFrameworks(result.data.frameworks);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load frameworks",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFrameworks(false);
        }
      }
    }

    void loadFrameworks();

    return () => {
      cancelled = true;
    };
  }, [selectedCourseId]);

  const handleCreateFramework = async () => {
    if (!selectedCourse) {
      toast.error("Select a course first");
      return;
    }

    try {
      setIsCreating(true);
      const result = await fetchJson<{
        success: true;
        data: { id: string; name: string; status: CourseFrameworkRecord["status"] };
      }>(`/api/expert/courses/${selectedCourse.courseId}/frameworks`, {
        method: "POST",
        body: JSON.stringify({
          name: `${selectedCourse.courseTitle} framework`,
        }),
      });

      setFrameworks((current) => [
        {
          id: result.data.id,
          name: result.data.name,
          status: result.data.status,
          updatedAt: new Date().toISOString(),
        },
        ...current,
      ]);
      router.push(`/expert/frameworks/${result.data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create framework");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <ExpertFrameworkSubnav
        title="Framework studio"
        description="Pick a course, review its framework rows, and open the editor."
      />

      <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Course
        </label>

        {courses.length === 0 ? (
          <p className="text-sm text-slate-500">No courses yet.</p>
        ) : (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm transition-colors hover:border-slate-400"
              >
                <span className="font-medium text-slate-950">
                  {selectedCourse?.courseTitle ?? "Select a course"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                    isMenuOpen && "rotate-180",
                  )}
                />
              </button>

              {isMenuOpen ? (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1">
                  {courses.map((row) => (
                    <li key={row.courseId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCourseId(row.courseId);
                          setIsMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full flex-col px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50",
                          row.courseId === selectedCourseId && "bg-slate-50",
                        )}
                      >
                        <span className="font-medium text-slate-950">{row.courseTitle}</span>
                        {row.description ? (
                          <span className="mt-0.5 line-clamp-1 text-slate-500">{row.description}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Framework rows</p>
                <p className="text-sm text-slate-500">
                  One framework can be live for this course at a time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleCreateFramework();
                }}
                disabled={isCreating || !selectedCourseId}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                New framework
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              {isLoadingFrameworks ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading frameworks...
                </div>
              ) : frameworks.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  No frameworks yet for this course.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {frameworks.map((framework) => (
                    <li key={framework.id} className="flex items-center justify-between gap-4 px-4 py-4">
                      <div>
                        <p className="font-medium text-slate-950">{framework.name}</p>
                        <p className="text-sm text-slate-500">
                          {framework.status} Ã¢â‚¬Â¢{" "}
                          {new Date(framework.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/expert/frameworks/${framework.id}`)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-950"
                      >
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

