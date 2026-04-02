"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { createWorkspace, setActiveWorkspace } from "@/app/actions/workspace";
import { queryKeys } from "@/lib/query-keys";
import { useRouter, Link } from "@/i18n/routing";

export function WorkspaceCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Workspace setup
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Create a shared workspace for teachers, classrooms, departments, and surveys.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                Your personal account stays private. A workspace is the shared institutional space where teachers can invite one another, organize departments, and collaborate through explicit access approvals.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/70 bg-white/75 p-6">
            <div className="text-sm font-semibold text-slate-950">What changes inside a workspace</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <div>Teachers can be invited into the same institution space.</div>
              <div>Classrooms belong to owners and stay private until access is granted.</div>
              <div>Departments keep large schools organized without weakening privacy.</div>
              <div>Class-linked surveys and shared folders can live alongside learning features.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.32)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-950">Create workspace</div>
              <div className="text-sm text-slate-500">This creates the shared institution container.</div>
            </div>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setIsSubmitting(true);

              const slug =
                form.slug.trim() ||
                form.name
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "");

              try {
                const created = await createWorkspace({
                  name: form.name.trim(),
                  slug,
                });

                if (!created.success) {
                  setError(created.error);
                  return;
                }

                const activated = await setActiveWorkspace(created.data.id);
                if (!activated.success) {
                  setError(activated.error);
                  return;
                }

                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active }),
                ]);

                toast.success("Workspace created");
                router.push("/dashboard/team");
                router.refresh();
              } catch (submissionError) {
                setError(
                  submissionError instanceof Error
                    ? submissionError.message
                    : "Failed to create workspace",
                );
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Greenfield Secondary School"
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            />
            <input
              value={form.slug}
              onChange={(event) =>
                setForm((current) => ({ ...current, slug: event.target.value }))
              }
              placeholder="Optional slug"
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            />
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              placeholder="Optional internal note about this workspace."
              className="w-full resize-none rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            />
            {error ? (
              <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !form.name.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
                Create workspace
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Stay in personal account
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
