"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import { ExpertFrameworkSubnav } from "@/components/expert/expert-framework-subnav";
import { useRouter } from "@/i18n/routing";
import type { ExpertFrameworkCourseSummary } from "@/lib/learning/expert-framework-summaries";
import { cn } from "@/lib/utils";

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
  const [frameworks] = useState(initialFrameworks);
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialFrameworks[0]?.courseId ?? "",
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  const selectedFramework = useMemo(
    () => frameworks.find((row) => row.courseId === selectedCourseId) ?? null,
    [frameworks, selectedCourseId],
  );

  const openStudio = async () => {
    if (!selectedCourseId || !selectedFramework) {
      toast.error("Select a course first");
      return;
    }

    if (selectedFramework.id) {
      router.push(`/expert/frameworks/${selectedFramework.id}/versions`);
      return;
    }

    try {
      setIsSaving(true);
      const result = await fetchJson<{
        success: true;
        data: { id: string };
      }>("/api/learning/expert/frameworks", {
        method: "POST",
        body: JSON.stringify({
          courseId: selectedCourseId,
          name: `${selectedFramework.courseTitle} framework`,
        }),
      });

      router.push(`/expert/frameworks/${result.data.id}/versions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open studio");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <ExpertFrameworkSubnav
        title="Framework studio"
        description="Pick a course, then open its framework editor."
      />

      <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Course
        </label>

        {frameworks.length === 0 ? (
          <p className="text-sm text-slate-500">
            No courses yet.{" "}
            <button
              type="button"
              onClick={() => router.push("/expert/frameworks/courses")}
              className="font-semibold text-slate-950 underline-offset-2 hover:underline"
            >
              Add a course
            </button>{" "}
            first.
          </p>
        ) : (
          <>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm transition-colors hover:border-slate-400"
                aria-expanded={isMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="font-medium text-slate-950">
                  {selectedFramework?.courseTitle ?? "Select a course"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                    isMenuOpen && "rotate-180",
                  )}
                />
              </button>

              {isMenuOpen ? (
                <ul
                  role="listbox"
                  className="absolute mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1"
                >
                  {frameworks.map((row) => (
                    <li key={row.courseId} role="option" aria-selected={row.courseId === selectedCourseId}>
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

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={openStudio}
                disabled={isSaving || !selectedCourseId}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {selectedFramework?.id ? "Open studio" : "Create and open studio"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
